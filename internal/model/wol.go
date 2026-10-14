package model

import "time"

// WOLConfig represents Wake-on-LAN Webhook configuration
type WOLConfig struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	WebhookURL string    `gorm:"type:text;not null" json:"webhookUrl"`
	Enabled            bool      `gorm:"default:true" json:"enabled"`
	InsecureSkipVerify bool      `gorm:"default:false" json:"insecureSkipVerify"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}
