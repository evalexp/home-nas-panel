package config

import (
	"os"
	"testing"
)

func TestLoadConfig_RandomSecret(t *testing.T) {
	_ = os.Unsetenv("JWT_SECRET")

	cfg1 := LoadConfig()
	if len(cfg1.JWTSecret) != 64 {
		t.Fatalf("expected 64 hex chars (32 bytes), got %d chars: %s", len(cfg1.JWTSecret), cfg1.JWTSecret)
	}

	cfg2 := LoadConfig()
	if cfg1.JWTSecret == cfg2.JWTSecret {
		t.Fatalf("expected different random secrets, but got identical: %s", cfg1.JWTSecret)
	}
}

func TestLoadConfig_ExplicitSecret(t *testing.T) {
	customSecret := "my-very-secure-custom-secret-key"
	_ = os.Setenv("JWT_SECRET", customSecret)
	defer os.Unsetenv("JWT_SECRET")

	cfg := LoadConfig()
	if cfg.JWTSecret != customSecret {
		t.Fatalf("expected %s, got %s", customSecret, cfg.JWTSecret)
	}
}
