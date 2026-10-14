package service

import (
	"errors"
	"time"

	"github.com/evalexp/home-nas-panel/internal/config"
	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	cfg *config.Config
}

func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{cfg: cfg}
}

// CheckIfUserExists checks if any user is registered (for first-time setup flow)
func (s *AuthService) CheckIfUserExists() (bool, error) {
	var count int64
	err := db.DB.Model(&model.User{}).Count(&count).Error
	return count > 0, err
}

// RegisterAdmin creates the initial admin user with password
func (s *AuthService) RegisterAdmin(username, password string) (*model.User, error) {
	var count int64
	db.DB.Model(&model.User{}).Count(&count)
	if count > 0 {
		return nil, errors.New("管理员已存在，请直接登录")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := model.User{
		Username:     username,
		PasswordHash: string(hash),
	}

	if err := db.DB.Create(&user).Error; err != nil {
		return nil, err
	}

	return &user, nil
}

// LoginWithPassword authenticates username and password
func (s *AuthService) LoginWithPassword(username, password string) (*model.User, string, error) {
	var user model.User
	err := db.DB.Preload("Passkeys").Where("username = ?", username).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", errors.New("用户不存在或密码错误")
		}
		return nil, "", err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("用户不存在或密码错误")
	}

	token, err := s.GenerateToken(user.ID, user.Username)
	if err != nil {
		return nil, "", err
	}

	return &user, token, nil
}

// GenerateToken creates a signed JWT for the authenticated user
func (s *AuthService) GenerateToken(userID uint, username string) (string, error) {
	claims := jwt.MapClaims{
		"userId":   userID,
		"username": username,
		"exp":      time.Now().Add(time.Hour * 24 * 30).Unix(), // 30 days valid for PWA convenience
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

// ValidateToken parses and validates a JWT token
func (s *AuthService) ValidateToken(tokenStr string) (uint, string, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("无效签名算法")
		}
		return []byte(s.cfg.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return 0, "", errors.New("无效或过期的令牌")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, "", errors.New("无效的令牌载荷")
	}

	uidFloat, ok := claims["userId"].(float64)
	if !ok {
		return 0, "", errors.New("缺少用户 ID")
	}

	username, _ := claims["username"].(string)
	return uint(uidFloat), username, nil
}
