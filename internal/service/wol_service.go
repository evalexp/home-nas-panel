package service

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
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

// WOLResponse matches the response structure of the OpenWrt WOL Webhook API
type WOLResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error"`
	MAC     string `json:"mac"`
}

// GetConfig returns the latest WOL config
func (s *WOLService) GetConfig() (*model.WOLConfig, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var cfg model.WOLConfig
	if err := db.DB.Order("id desc").First(&cfg).Error; err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig saves or updates the WOL Webhook URL and TLS settings
func (s *WOLService) SaveConfig(webhookURL string, insecureSkipVerify bool) (*model.WOLConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	webhookURL = strings.TrimSpace(webhookURL)
	if webhookURL == "" {
		return nil, errors.New("Webhook 地址不能为空")
	}

	var cfg model.WOLConfig
	if err := db.DB.Order("id desc").First(&cfg).Error; err != nil {
		cfg = model.WOLConfig{
			WebhookURL:         webhookURL,
			InsecureSkipVerify: insecureSkipVerify,
			Enabled:            true,
			UpdatedAt:          time.Now(),
		}
		if err := db.DB.Create(&cfg).Error; err != nil {
			return nil, fmt.Errorf("保存配置失败: %w", err)
		}
	} else {
		cfg.WebhookURL = webhookURL
		cfg.InsecureSkipVerify = insecureSkipVerify
		cfg.UpdatedAt = time.Now()
		if err := db.DB.Save(&cfg).Error; err != nil {
			return nil, fmt.Errorf("更新配置失败: %w", err)
		}
	}

	return &cfg, nil
}

// DeleteConfig removes the saved WOL Webhook configuration
func (s *WOLService) DeleteConfig() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	return db.DB.Where("1 = 1").Delete(&model.WOLConfig{}).Error
}

// TriggerWakeURL sends a GET request to targetURL and parses the returned JSON response
func (s *WOLService) TriggerWakeURL(targetURL string, insecureSkipVerify bool) (*WOLResponse, error) {
	targetURL = strings.TrimSpace(targetURL)
	if targetURL == "" {
		return nil, errors.New("Webhook 地址不能为空")
	}

	var transport *http.Transport
	if insecureSkipVerify {
		transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	} else {
		transport = http.DefaultTransport.(*http.Transport).Clone()
	}

	client := &http.Client{
		Timeout:   6 * time.Second,
		Transport: transport,
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("User-Agent", "HomeNASPanel-WOL/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Webhook 请求失败: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 Webhook 响应失败: %w", err)
	}

	var res WOLResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("Webhook 返回错误 (%d): %s", resp.StatusCode, strings.TrimSpace(string(bodyBytes)))
		}
		return nil, fmt.Errorf("解析 Webhook 响应失败: %w (响应: %s)", err, strings.TrimSpace(string(bodyBytes)))
	}

	if !res.Success {
		errMsg := res.Error
		if errMsg == "" {
			errMsg = res.Message
		}
		if errMsg == "" {
			errMsg = fmt.Sprintf("状态码 %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("WOL 唤醒失败: %s", errMsg)
	}

	return &res, nil
}

// TriggerWake triggers the configured Webhook URL to wake up the host
func (s *WOLService) TriggerWake() (*WOLResponse, error) {
	cfg, err := s.GetConfig()
	if err != nil || strings.TrimSpace(cfg.WebhookURL) == "" {
		return nil, errors.New("未配置开机 Webhook 地址，请先在设置中配置")
	}

	return s.TriggerWakeURL(cfg.WebhookURL, cfg.InsecureSkipVerify)
}
