package service

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
	"gorm.io/gorm"
)

type WOLService struct {
	mu       sync.RWMutex
	client   *http.Client
	insecure *http.Client
}

func NewWOLService() *WOLService {
	noRedirect := func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} // Only used when explicitly configured.
	return &WOLService{
		client:   &http.Client{Timeout: 8 * time.Second, CheckRedirect: noRedirect},
		insecure: &http.Client{Timeout: 8 * time.Second, CheckRedirect: noRedirect, Transport: transport},
	}
}

// WOLResponse represents the result of a wake operation
type WOLResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
	MAC     string `json:"mac,omitempty"`
}

var ErrInvalidWOLConfig = errors.New("WOL Webhook 配置无效")

func validateWebhookURL(rawURL string) error {
	if !strings.Contains(rawURL, "{mac}") || strings.ContainsAny(rawURL, " \t\r\n") {
		return errors.New("请输入包含 {mac} 占位符的单个完整 URL")
	}
	u, err := url.Parse(strings.ReplaceAll(rawURL, "{mac}", "00:11:22:33:44:55"))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return errors.New("仅支持不含用户信息或片段的 HTTP/HTTPS URL")
	}
	original, err := url.Parse(rawURL)
	if err != nil || strings.Contains(original.Host, "{mac}") {
		return errors.New("{mac} 占位符只能用于 URL 路径或查询参数")
	}
	return nil
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
func (s *WOLService) SaveConfig(wakeURL, statusURL string, tlsSkipVerify bool) (*model.WOLConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	wakeURL, statusURL = strings.TrimSpace(wakeURL), strings.TrimSpace(statusURL)
	for _, field := range []struct{ name, value string }{{"唤醒 Webhook", wakeURL}, {"在线检测 Webhook", statusURL}} {
		if err := validateWebhookURL(field.value); err != nil {
			return nil, fmt.Errorf("%w：%s，%s", ErrInvalidWOLConfig, field.name, err)
		}
	}

	var cfg model.WOLConfig
	err := db.DB.Order("id desc").First(&cfg).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("读取配置失败: %w", err)
	}
	cfg.WakeURL = wakeURL
	cfg.StatusURL = statusURL
	cfg.TLSSkipVerify = tlsSkipVerify
	cfg.Enabled = true
	cfg.UpdatedAt = time.Now()
	if err := db.DB.Save(&cfg).Error; err != nil {
		return nil, fmt.Errorf("保存配置失败: %w", err)
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

// callWebhook keeps URL query credentials out of error messages.
func (s *WOLService) callWebhook(ctx context.Context, rawURL, mac string, tlsSkipVerify bool) ([]byte, error) {
	if err := validateWebhookURL(rawURL); err != nil {
		return nil, errors.New("请在系统设置中配置有效的 WOL Webhook URL")
	}
	mac = strings.TrimSpace(mac)
	if parsed, err := net.ParseMAC(mac); err != nil || len(parsed) != 6 {
		return nil, errors.New("MAC 地址格式不正确")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.ReplaceAll(rawURL, "{mac}", url.QueryEscape(mac)), nil)
	if err != nil {
		return nil, errors.New("无法创建 Webhook 请求，请检查 URL")
	}
	req.Header.Set("User-Agent", "HomeNASPanel-WOL/1.0")
	req.Header.Set("Cache-Control", "no-cache")
	client := s.client
	if tlsSkipVerify {
		client = s.insecure
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.New("Webhook 请求失败，请检查网络、URL 或 TLS 证书（请求超时为 8 秒）")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Webhook 返回 HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024+1))
	if err != nil {
		return nil, errors.New("读取 Webhook 响应失败")
	}
	if len(body) > 64*1024 {
		return nil, errors.New("Webhook 响应超过 64KB 限制")
	}
	return body, nil
}

func (s *WOLService) SendWakeWebhook(cfg *model.WOLConfig, mac string) (*WOLResponse, error) {
	if cfg == nil || strings.TrimSpace(cfg.WakeURL) == "" {
		return nil, errors.New("尚未配置唤醒 Webhook，请先在系统设置中配置")
	}
	body, err := s.callWebhook(context.Background(), cfg.WakeURL, mac, cfg.TLSSkipVerify)
	if err != nil {
		return nil, err
	}
	var payload struct {
		Success *bool  `json:"success"`
		Message string `json:"message"`
	}
	if json.Unmarshal(body, &payload) == nil && payload.Success != nil && !*payload.Success {
		return nil, errors.New("WOL 唤醒失败：Webhook 返回 success: false")
	}
	message := payload.Message
	if message == "" {
		message = "唤醒指令已成功发送"
	}
	return &WOLResponse{Success: true, Message: message, MAC: strings.TrimSpace(mac)}, nil
}

// WOLDeviceStatus distinguishes a failed check from a confirmed offline device.
type WOLDeviceStatus struct {
	DeviceID  uint      `json:"deviceId"`
	Status    string    `json:"status"`
	Error     string    `json:"error,omitempty"`
	CheckedAt time.Time `json:"checkedAt"`
}

func (s *WOLService) checkDeviceStatus(ctx context.Context, cfg *model.WOLConfig, device model.WOLDevice) WOLDeviceStatus {
	result := WOLDeviceStatus{DeviceID: device.ID, Status: "unknown"}
	body, err := s.callWebhook(ctx, cfg.StatusURL, device.MAC, cfg.TLSSkipVerify)
	result.CheckedAt = time.Now()
	if err != nil {
		result.Error = err.Error()
		return result
	}
	var payload struct {
		Success *bool `json:"success"`
		Online  *bool `json:"online"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.Online == nil {
		result.Error = "在线检测 Webhook 必须返回包含布尔字段 online 的 JSON"
		return result
	}
	if payload.Success != nil && !*payload.Success {
		result.Error = "在线检测 Webhook 返回 success: false"
		return result
	}
	result.Status = "offline"
	if *payload.Online {
		result.Status = "online"
	}
	return result
}

// ListDeviceStatuses checks up to four hosts concurrently without blocking device CRUD.
func (s *WOLService) ListDeviceStatuses(ctx context.Context) ([]WOLDeviceStatus, error) {
	cfg, err := s.GetConfig()
	if err != nil || strings.TrimSpace(cfg.StatusURL) == "" {
		return nil, errors.New("尚未配置在线检测 Webhook，请先在系统设置中配置")
	}
	devices, err := s.ListDevices()
	if err != nil {
		return nil, err
	}
	results := make([]WOLDeviceStatus, len(devices))
	jobs := make(chan int)
	var wg sync.WaitGroup
	for worker := 0; worker < 4 && worker < len(devices); worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				results[i] = s.checkDeviceStatus(ctx, cfg, devices[i])
			}
		}()
	}
	for i := range devices {
		select {
		case jobs <- i:
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return nil, ctx.Err()
		}
	}
	close(jobs)
	wg.Wait()
	return results, nil
}

// WakeDevice triggers wake for a registered device by ID
func (s *WOLService) WakeDevice(id uint) (*WOLResponse, error) {
	device, err := s.GetDevice(id)
	if err != nil {
		return nil, errors.New("找不到指定的 WOL 设备")
	}
	cfg, err := s.GetConfig()
	if err != nil || strings.TrimSpace(cfg.WakeURL) == "" {
		return nil, errors.New("尚未配置 WOL 控制参数，请先在系统设置中配置")
	}
	return s.SendWakeWebhook(cfg, device.MAC)
}

// WakeMAC triggers wake directly with a given MAC address
func (s *WOLService) WakeMAC(mac string) (*WOLResponse, error) {
	cfg, err := s.GetConfig()
	if err != nil || strings.TrimSpace(cfg.WakeURL) == "" {
		return nil, errors.New("尚未配置 WOL 控制参数，请先在系统设置中配置")
	}
	return s.SendWakeWebhook(cfg, mac)
}
