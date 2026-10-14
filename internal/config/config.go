package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

type Config struct {
	Port         string
	DBPath       string
	JWTSecret    string
	RPID         string   // WebAuthn Relying Party ID (domain / hostname)
	RPName       string   // Display name
	RPOrigins    []string // Allowed origins e.g. ["http://localhost:8080", "http://192.168.1.50:8080"]
}

// generateRandomSecret generates a cryptographically secure random hex string
func generateRandomSecret(bytesLen int) string {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("无法生成安全的随机 JWT 密钥: %v", err)
	}
	return hex.EncodeToString(b)
}

func LoadConfig() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "nas_panel.db"
	}

	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if jwtSecret == "" {
		jwtSecret = generateRandomSecret(32)
		log.Println("[Security] 未配置环境变量 JWT_SECRET，已自动生成安全的 256 位随机密钥供当前实例使用")
	}

	rpID := os.Getenv("WEBAUTHN_RP_ID")
	if rpID == "" {
		rpID = "localhost"
	}

	rpName := os.Getenv("WEBAUTHN_RP_NAME")
	if rpName == "" {
		rpName = "Home NAS Panel"
	}

	return &Config{
		Port:      port,
		DBPath:    dbPath,
		JWTSecret: jwtSecret,
		RPID:      rpID,
		RPName:    rpName,
		RPOrigins: []string{
			"http://localhost:8080",
			"http://localhost:5173",
			"http://127.0.0.1:8080",
			"http://127.0.0.1:5173",
		},
	}
}
