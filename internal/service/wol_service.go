package service

import (
	"bufio"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
)

type WOLService struct {
	mu sync.RWMutex
}

func NewWOLService() *WOLService {
	return &WOLService{}
}

// WOLResponse represents the result of a wake operation
type WOLResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
	MAC     string `json:"mac,omitempty"`
}

// FormatDefaultPacket builds the default HTTP wake packet template
func FormatDefaultPacket(host string, port int, useTLS bool) string {
	host = strings.TrimSpace(host)
	if host == "" {
		host = "192.168.1.1"
	}
	hostHeader := host
	if (!useTLS && port != 80 && port > 0) || (useTLS && port != 443 && port > 0) {
		hostHeader = fmt.Sprintf("%s:%d", host, port)
	}
	return fmt.Sprintf("GET /wakeup?token=REPLACE_YOUR_TOKEN_HERE&mac={mac} HTTP/1.1\r\nHost: %s\r\nUser-Agent: HomeNASPanel-WOL/1.0\r\nConnection: close\r\n\r\n", hostHeader)
}

// GetConfig returns the latest WOL control gateway configuration
func (s *WOLService) GetConfig() (*model.WOLConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var cfg model.WOLConfig
	if err := db.DB.Order("id desc").First(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig saves or updates the WOL Control parameters
func (s *WOLService) SaveConfig(host string, port int, useTLS, tlsSkipVerify bool, packetTemplate string) (*model.WOLConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	host = strings.TrimSpace(host)
	if host == "" {
		return nil, errors.New("域名或 IP 地址不能为空")
	}

	if port <= 0 {
		if useTLS {
			port = 443
		} else {
			port = 80
		}
	}

	if strings.TrimSpace(packetTemplate) == "" {
		packetTemplate = FormatDefaultPacket(host, port, useTLS)
	}

	var cfg model.WOLConfig
	if err := db.DB.Order("id desc").First(&cfg).Error; err != nil {
		cfg = model.WOLConfig{
			Host:           host,
			Port:           port,
			UseTLS:         useTLS,
			TLSSkipVerify:  tlsSkipVerify,
			PacketTemplate: packetTemplate,
			Enabled:        true,
			UpdatedAt:      time.Now(),
		}
		if err := db.DB.Create(&cfg).Error; err != nil {
			return nil, fmt.Errorf("保存配置失败: %w", err)
		}
	} else {
		cfg.Host = host
		cfg.Port = port
		cfg.UseTLS = useTLS
		cfg.TLSSkipVerify = tlsSkipVerify
		cfg.PacketTemplate = packetTemplate
		cfg.UpdatedAt = time.Now()
		if err := db.DB.Save(&cfg).Error; err != nil {
			return nil, fmt.Errorf("更新配置失败: %w", err)
		}
	}

	return &cfg, nil
}

// DeleteConfig removes the saved WOL configuration
func (s *WOLService) DeleteConfig() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return db.DB.Where("1 = 1").Delete(&model.WOLConfig{}).Error
}

// ListDevices returns all registered WOL devices sorted chronologically (id asc)
func (s *WOLService) ListDevices() ([]model.WOLDevice, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var devices []model.WOLDevice
	err := db.DB.Order("id asc").Find(&devices).Error
	return devices, err
}

// GetDevice returns a single WOL device by ID
func (s *WOLService) GetDevice(id uint) (*model.WOLDevice, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var device model.WOLDevice
	if err := db.DB.First(&device, id).Error; err != nil {
		return nil, err
	}
	return &device, nil
}

// CreateDevice registers a new WOL device
func (s *WOLService) CreateDevice(name, mac string) (*model.WOLDevice, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name = strings.TrimSpace(name)
	mac = strings.TrimSpace(mac)
	if name == "" {
		return nil, errors.New("机器名称不能为空")
	}
	if mac == "" {
		return nil, errors.New("MAC 地址不能为空")
	}

	device := model.WOLDevice{
		Name:      name,
		MAC:       mac,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := db.DB.Create(&device).Error; err != nil {
		return nil, fmt.Errorf("添加设备失败: %w", err)
	}
	return &device, nil
}

// UpdateDevice updates an existing WOL device
func (s *WOLService) UpdateDevice(id uint, name, mac string) (*model.WOLDevice, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name = strings.TrimSpace(name)
	mac = strings.TrimSpace(mac)
	if name == "" {
		return nil, errors.New("机器名称不能为空")
	}
	if mac == "" {
		return nil, errors.New("MAC 地址不能为空")
	}

	var device model.WOLDevice
	if err := db.DB.First(&device, id).Error; err != nil {
		return nil, errors.New("指定设备不存在")
	}

	device.Name = name
	device.MAC = mac
	device.UpdatedAt = time.Now()
	if err := db.DB.Save(&device).Error; err != nil {
		return nil, fmt.Errorf("更新设备失败: %w", err)
	}
	return &device, nil
}

// DeleteDevice deletes a registered WOL device and clears PVE binding if referenced
func (s *WOLService) DeleteDevice(id uint) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clear foreign binding from PVEConfig
	_ = db.DB.Model(&model.PVEConfig{}).Where("wol_device_id = ?", id).Update("wol_device_id", nil).Error
	return db.DB.Delete(&model.WOLDevice{}, id).Error
}

// SendWakePacket substitutes MAGICSTRING in the packet template and transmits to host:port
func (s *WOLService) SendWakePacket(cfg *model.WOLConfig, mac string) (*WOLResponse, error) {
	if cfg == nil || strings.TrimSpace(cfg.Host) == "" {
		return nil, errors.New("WOL 控制尚未配置，请在系统设置中配置主机与报文模板")
	}

	mac = strings.TrimSpace(mac)
	if mac == "" {
		return nil, errors.New("MAC 地址不能为空")
	}

	template := cfg.PacketTemplate
	if strings.TrimSpace(template) == "" {
		template = FormatDefaultPacket(cfg.Host, cfg.Port, cfg.UseTLS)
	}

	port := cfg.Port
	if port <= 0 {
		if cfg.UseTLS {
			port = 443
		} else {
			port = 80
		}
	}

	// Only substitute {mac} and {MAC} placeholders. Send raw packet as configured without backend normalization.
	packetStr := template
	packetStr = strings.ReplaceAll(packetStr, "{mac}", mac)
	packetStr = strings.ReplaceAll(packetStr, "{MAC}", mac)

	addr := net.JoinHostPort(cfg.Host, strconv.Itoa(port))
	dialer := &net.Dialer{Timeout: 6 * time.Second}

	var conn net.Conn
	var err error
	if cfg.UseTLS {
		tlsConfig := &tls.Config{
			InsecureSkipVerify: cfg.TLSSkipVerify,
			ServerName:         cfg.Host,
		}
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	} else {
		conn, err = dialer.Dial("tcp", addr)
	}
	if err != nil {
		return nil, fmt.Errorf("连接 WOL 服务器 (%s) 失败: %w", addr, err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(8 * time.Second))

	if _, err := conn.Write([]byte(packetStr)); err != nil {
		return nil, fmt.Errorf("发送 WOL 报文失败: %w", err)
	}

	// Read HTTP response
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		if errors.Is(err, io.EOF) {
			return &WOLResponse{
				Success: true,
				Message: "报文已成功发送至 WOL 网关",
				MAC:     mac,
			}, nil
		}
		return nil, fmt.Errorf("读取 WOL 响应失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))

	var res WOLResponse
	if err := json.Unmarshal(bodyBytes, &res); err == nil {
		if !res.Success && (res.Error != "" || res.Message != "") {
			errMsg := res.Error
			if errMsg == "" {
				errMsg = res.Message
			}
			return nil, fmt.Errorf("WOL 唤醒失败: %s", errMsg)
		}
		if res.Message == "" {
			res.Message = "唤醒报文发送成功"
		}
		if res.MAC == "" {
			res.MAC = mac
		}
		res.Success = true
		return &res, nil
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("WOL 服务返回错误 (%d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
	}

	return &WOLResponse{
		Success: true,
		Message: fmt.Sprintf("唤醒报文发送成功 (HTTP %d)", resp.StatusCode),
		MAC:     mac,
	}, nil
}

// WakeDevice triggers wake for a registered device by ID
func (s *WOLService) WakeDevice(id uint) (*WOLResponse, error) {
	device, err := s.GetDevice(id)
	if err != nil {
		return nil, errors.New("找不到指定的 WOL 设备")
	}
	cfg, err := s.GetConfig()
	if err != nil || strings.TrimSpace(cfg.Host) == "" {
		return nil, errors.New("尚未配置 WOL 控制参数，请先在系统设置中配置")
	}
	return s.SendWakePacket(cfg, device.MAC)
}

// WakeMAC triggers wake directly with a given MAC address
func (s *WOLService) WakeMAC(mac string) (*WOLResponse, error) {
	cfg, err := s.GetConfig()
	if err != nil || strings.TrimSpace(cfg.Host) == "" {
		return nil, errors.New("尚未配置 WOL 控制参数，请先在系统设置中配置")
	}
	return s.SendWakePacket(cfg, mac)
}
