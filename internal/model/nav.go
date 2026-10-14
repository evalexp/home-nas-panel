package model

import "time"

// NavIcon represents a reusable uploaded custom icon
type NavIcon struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `json:"name"`                  // User-defined name or original file name
	Data      string    `gorm:"type:text" json:"data"` // Base64 data URL string (e.g. data:image/png;base64,...)
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// NavItem represents a link or service in the NAS dashboard
type NavItem struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Title       string    `gorm:"not null" json:"title"`
	URL         string    `gorm:"not null" json:"url"`
	Icon        string    `json:"icon"`                  // Lucide preset icon name e.g. "Globe", "Server"
	IconID      *uint     `json:"iconId"`                // Reference to reusable NavIcon
	CustomIcon  *NavIcon  `gorm:"foreignKey:IconID" json:"customIcon,omitempty"`
	Category    string    `json:"category"`              // e.g. "管理", "媒体", "网络", "下载"
	Description string    `json:"description"`
	OrderIndex  int       `gorm:"default:0" json:"orderIndex"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
