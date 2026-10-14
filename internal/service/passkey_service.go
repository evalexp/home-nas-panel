package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/evalexp/home-nas-panel/internal/config"
	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/protocol/webauthncose"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PasskeyService struct {
	cfg *config.Config
}

func NewPasskeyService(cfg *config.Config) *PasskeyService {
	return &PasskeyService{cfg: cfg}
}

// getWebAuthnInstance creates a WebAuthn instance tailored to the client's host/origin
func (s *PasskeyService) getWebAuthnInstance(r *http.Request) (*webauthn.WebAuthn, error) {
	// Extract origin or determine from Host header
	origin := r.Header.Get("Origin")
	host := r.Host

	rpID := s.cfg.RPID
	var allowedOrigins []string

	if origin != "" {
		allowedOrigins = append(allowedOrigins, origin)
		u, err := url.Parse(origin)
		if err == nil && u.Hostname() != "" && net.ParseIP(u.Hostname()) == nil {
			rpID = u.Hostname()
		}
	} else if ref := r.Header.Get("Referer"); ref != "" {
		if u, err := url.Parse(ref); err == nil && u.Scheme != "" && u.Host != "" {
			origin = fmt.Sprintf("%s://%s", u.Scheme, u.Host)
			allowedOrigins = append(allowedOrigins, origin)
			if u.Hostname() != "" && net.ParseIP(u.Hostname()) == nil {
				rpID = u.Hostname()
			}
		}
	} else if host != "" {
		hostOnly := strings.Split(host, ":")[0]
		if net.ParseIP(hostOnly) == nil {
			rpID = hostOnly
		}
		scheme := "http"
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		allowedOrigins = append(allowedOrigins, fmt.Sprintf("%s://%s", scheme, host))
	}

	// Always ensure localhost / 127.0.0.1 are also accepted
	for _, o := range s.cfg.RPOrigins {
		allowedOrigins = append(allowedOrigins, o)
	}

	wconfig := &webauthn.Config{
		RPDisplayName: s.cfg.RPName,
		RPID:          rpID,
		RPOrigins:     allowedOrigins,
	}

	return webauthn.New(wconfig)
}

// BeginRegistration starts the Passkey enrollment flow for a user
func (s *PasskeyService) BeginRegistration(r *http.Request, user *model.User) (*protocol.CredentialCreation, string, error) {
	wa, err := s.getWebAuthnInstance(r)
	if err != nil {
		return nil, "", err
	}

	// Load existing passkeys
	db.DB.Preload("Passkeys").First(user, user.ID)

	var excludeList []protocol.CredentialDescriptor
	for _, pk := range user.Passkeys {
		excludeList = append(excludeList, protocol.CredentialDescriptor{
			Type:         protocol.PublicKeyCredentialType,
			CredentialID: pk.CredentialID,
		})
	}

	creation, sessionData, err := wa.BeginRegistration(
		user,
		webauthn.WithExclusions(excludeList),
		webauthn.WithConveyancePreference(protocol.PreferNoAttestation),
		webauthn.WithCredentialParameters([]protocol.CredentialParameter{
			{Type: protocol.PublicKeyCredentialType, Algorithm: webauthncose.AlgES256},
			{Type: protocol.PublicKeyCredentialType, Algorithm: webauthncose.AlgRS256},
			{Type: protocol.PublicKeyCredentialType, Algorithm: webauthncose.AlgEdDSA},
		}),
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementPreferred,
			UserVerification: protocol.VerificationPreferred,
		}),
	)
	if err != nil {
		return nil, "", err
	}

	sessionBytes, err := json.Marshal(sessionData)
	if err != nil {
		return nil, "", err
	}

	sessionID := uuid.New().String()
	sess := model.WebAuthnSession{
		ID:        sessionID,
		Data:      string(sessionBytes),
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	db.DB.Create(&sess)

	return creation, sessionID, nil
}

// FinishRegistration completes the Passkey registration
func (s *PasskeyService) FinishRegistration(r *http.Request, user *model.User, sessionID string, deviceName string) (*model.PasskeyCredential, error) {
	var sess model.WebAuthnSession
	if err := db.DB.Where("id = ? AND expires_at > ?", sessionID, time.Now()).First(&sess).Error; err != nil {
		return nil, errors.New("会话已失效或不存在，请重试")
	}
	defer db.DB.Delete(&sess)

	var sessionData webauthn.SessionData
	if err := json.Unmarshal([]byte(sess.Data), &sessionData); err != nil {
		return nil, err
	}

	wa, err := s.getWebAuthnInstance(r)
	if err != nil {
		return nil, err
	}

	credential, err := wa.FinishRegistration(user, sessionData, r)
	if err != nil {
		return nil, fmt.Errorf("Passkey 验证失败: %w", err)
	}

	if deviceName == "" {
		deviceName = "我的 Passkey 设备"
	}

	transports := ""
	if len(credential.Transport) > 0 {
		transports = string(credential.Transport[0])
	}

	pk := model.PasskeyCredential{
		UserID:          user.ID,
		CredentialID:    credential.ID,
		PublicKey:       credential.PublicKey,
		AttestationType: credential.AttestationType,
		AAGUID:          credential.Authenticator.AAGUID,
		SignCount:       credential.Authenticator.SignCount,
		DeviceName:      deviceName,
		Transports:      transports,
		BackupEligible:  credential.Flags.BackupEligible,
		BackupState:     credential.Flags.BackupState,
		UserPresent:     credential.Flags.UserPresent,
		UserVerified:    credential.Flags.UserVerified,
		CreatedAt:       time.Now(),
	}

	if err := db.DB.Create(&pk).Error; err != nil {
		return nil, err
	}

	return &pk, nil
}

// BeginLogin starts Passkey authentication
func (s *PasskeyService) BeginLogin(r *http.Request, username string) (*protocol.CredentialAssertion, string, error) {
	wa, err := s.getWebAuthnInstance(r)
	if err != nil {
		return nil, "", err
	}

	var user model.User
	if username != "" {
		if err := db.DB.Preload("Passkeys").Where("username = ?", username).First(&user).Error; err != nil {
			return nil, "", errors.New("用户不存在")
		}
	} else {
		// Discoverable / single-user home lab scenario: grab first user
		if err := db.DB.Preload("Passkeys").First(&user).Error; err != nil {
			return nil, "", errors.New("系统尚未初始化管理员")
		}
	}

	if len(user.Passkeys) == 0 {
		return nil, "", errors.New("该用户尚未绑定任何 Passkey")
	}

	assertion, sessionData, err := wa.BeginLogin(&user)
	if err != nil {
		return nil, "", err
	}

	sessionBytes, err := json.Marshal(sessionData)
	if err != nil {
		return nil, "", err
	}

	sessionID := uuid.New().String()
	sess := model.WebAuthnSession{
		ID:        sessionID,
		Data:      string(sessionBytes),
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	db.DB.Create(&sess)

	return assertion, sessionID, nil
}

// FinishLogin verifies assertion and returns user on success
func (s *PasskeyService) FinishLogin(r *http.Request, sessionID string, username string) (*model.User, error) {
	var sess model.WebAuthnSession
	if err := db.DB.Where("id = ? AND expires_at > ?", sessionID, time.Now()).First(&sess).Error; err != nil {
		return nil, errors.New("会话已失效或不存在，请重试")
	}
	defer db.DB.Delete(&sess)

	var sessionData webauthn.SessionData
	if err := json.Unmarshal([]byte(sess.Data), &sessionData); err != nil {
		return nil, err
	}

	var user model.User
	if username != "" {
		if err := db.DB.Preload("Passkeys").Where("username = ?", username).First(&user).Error; err != nil {
			return nil, errors.New("用户不存在")
		}
	} else {
		if err := db.DB.Preload("Passkeys").First(&user).Error; err != nil {
			return nil, errors.New("用户不存在")
		}
	}

	wa, err := s.getWebAuthnInstance(r)
	if err != nil {
		return nil, err
	}

	credential, err := wa.FinishLogin(&user, sessionData, r)
	if err != nil {
		return nil, fmt.Errorf("Passkey 登录验证失败: %w", err)
	}

	// Update sign count & backup state
	db.DB.Model(&model.PasskeyCredential{}).
		Where("credential_id = ?", credential.ID).
		Updates(map[string]interface{}{
			"sign_count":   credential.Authenticator.SignCount,
			"backup_state": credential.Flags.BackupState,
		})

	return &user, nil
}

// DeletePasskey removes a specific passkey
func (s *PasskeyService) DeletePasskey(userID uint, passkeyID uint) error {
	res := db.DB.Where("id = ? AND user_id = ?", passkeyID, userID).Delete(&model.PasskeyCredential{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
