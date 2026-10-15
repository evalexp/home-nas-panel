package model

import "time"

// WOLConfig represents Wake-on-LAN control gateway configuration
type WOLConfig struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	Host           string    `gorm:"type:text;default:''" json:"host"`
	Port           int       `gorm:"default:80" json:"port"`
	UseTLS         bool      `gorm:"default:false" json:"useTls"`
	TLSSkipVerify  bool      `gorm:"default:false" json:"tlsSkipVerify"`
	PacketTemplate string    `gorm:"type:text;default:''" json:"packetTemplate"`
	Enabled        bool      `gorm:"default:true" json:"enabled"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// WOLDevice represents a machine configured for Wake-on-LAN
type WOLDevice struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"type:varchar(100);not null" json:"name"`
	MAC       string    `gorm:"type:varchar(50);not null" json:"mac"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
