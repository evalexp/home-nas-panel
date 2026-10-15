package model

import "time"

// PVEConfig stores Proxmox VE connection credentials
type PVEConfig struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	Endpoint           string    `gorm:"not null" json:"endpoint"` // e.g. https://192.168.1.100:8006
	TokenID            string    `gorm:"not null" json:"tokenId"`  // e.g. root@pam!nas-panel
	TokenSecret        string    `gorm:"not null" json:"tokenSecret"` // e.g. uuid
	InsecureSkipVerify bool      `json:"insecureSkipVerify"`       // allow self-signed certs
	DefaultNode        string    `json:"defaultNode"`              // default node name (e.g. pve)
	WOLDeviceID        *uint     `json:"wolDeviceId"`              // bound WOL Device ID
	Enabled            bool      `gorm:"default:true" json:"enabled"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

// PVENodeStatus represents host node metrics
type PVENodeStatus struct {
	Node        string  `json:"node"`
	Status      string  `json:"status"` // online / offline
	Uptime      int64   `json:"uptime"` // seconds
	CPUUsage    float64 `json:"cpuUsage"` // 0.0 - 1.0
	CPUs        int     `json:"cpus"`
	MemoryTotal int64   `json:"memoryTotal"` // bytes
	MemoryUsed  int64   `json:"memoryUsed"`  // bytes
	DiskTotal   int64   `json:"diskTotal"`   // bytes
	DiskUsed    int64   `json:"diskUsed"`    // bytes
	KVersion    string  `json:"kversion"`
	PVEVersion  string  `json:"pveversion"`
}

// PVEGuest represents VM (qemu) or Container (lxc)
type PVEGuest struct {
	VMID    int     `json:"vmid"`
	Name    string  `json:"name"`
	Type    string  `json:"type"` // "qemu" or "lxc"
	Status  string  `json:"status"` // "running", "stopped"
	CPU     float64 `json:"cpu"`
	CPUs    int     `json:"cpus"`
	Mem     int64   `json:"mem"`
	MaxMem  int64   `json:"maxmem"`
	Uptime  int64   `json:"uptime"`
	NetIn   int64   `json:"netin"`
	NetOut  int64   `json:"netout"`
}
