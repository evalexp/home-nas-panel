package db

import (
	"log"

	"github.com/evalexp/home-nas-panel/internal/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB(dbPath string) (*gorm.DB, error) {
	database, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	// Auto-migrate tables
	err = database.AutoMigrate(
		&model.User{},
		&model.PasskeyCredential{},
		&model.WebAuthnSession{},
		&model.PVEConfig{},
		&model.NavIcon{},
		&model.NavItem{},
		&model.WOLConfig{},
	)
	if err != nil {
		return nil, err
	}

	DB = database
	log.Printf("SQLite database initialized at: %s", dbPath)
	return DB, nil
}
