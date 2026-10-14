package model

import (
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

type User struct {
	ID           uint                `gorm:"primaryKey" json:"id"`
	Username     string              `gorm:"uniqueIndex;not null" json:"username"`
	PasswordHash string              `json:"-"`
	Passkeys     []PasskeyCredential `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"passkeys"`
	CreatedAt    time.Time           `json:"createdAt"`
	UpdatedAt    time.Time           `json:"updatedAt"`
}

// PasskeyCredential stores WebAuthn credentials registered by user
type PasskeyCredential struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"index;not null" json:"userId"`
	CredentialID    []byte    `gorm:"uniqueIndex;not null" json:"credentialId"`
	PublicKey       []byte    `gorm:"not null" json:"-"`
	AttestationType string    `json:"attestationType"`
	AAGUID          []byte    `json:"-"`
	SignCount       uint32    `json:"signCount"`
	DeviceName      string    `json:"deviceName"`
	Transports      string    `json:"transports"` // JSON serialized transports
	BackupEligible  bool      `json:"backupEligible"`
	BackupState     bool      `json:"backupState"`
	UserPresent     bool      `json:"userPresent"`
	UserVerified    bool      `json:"userVerified"`
	CreatedAt       time.Time `json:"createdAt"`
}

// WebAuthnUser adapter interface implementation for User
func (u *User) WebAuthnID() []byte {
	return []byte(u.Username)
}

func (u *User) WebAuthnName() string {
	return u.Username
}

func (u *User) WebAuthnDisplayName() string {
	return u.Username
}

func (u *User) WebAuthnCredentials() []webauthn.Credential {
	creds := make([]webauthn.Credential, 0, len(u.Passkeys))
	for _, pk := range u.Passkeys {
		var transports []protocol.AuthenticatorTransport
		if pk.Transports != "" {
			// standard transport strings
			transports = []protocol.AuthenticatorTransport{protocol.AuthenticatorTransport(pk.Transports)}
		}
		creds = append(creds, webauthn.Credential{
			ID:              pk.CredentialID,
			PublicKey:       pk.PublicKey,
			AttestationType: pk.AttestationType,
			Transport:       transports,
			Flags: webauthn.CredentialFlags{
				BackupEligible: pk.BackupEligible,
				BackupState:    pk.BackupState,
				UserPresent:    pk.UserPresent,
				UserVerified:   pk.UserVerified,
			},
			Authenticator: webauthn.Authenticator{
				AAGUID:    pk.AAGUID,
				SignCount: pk.SignCount,
			},
		})
	}
	return creds
}

type WebAuthnSession struct {
	ID        string    `gorm:"primaryKey" json:"id"` // token/challenge ID
	Data      string    `json:"data"`                 // json serialized SessionData
	ExpiresAt time.Time `json:"expiresAt"`
}
