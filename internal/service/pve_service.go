package service

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
)

type PVEService struct{}

func NewPVEService() *PVEService {
	return &PVEService{}
}

// GetConfig gets current PVE configuration
func (s *PVEService) GetConfig() (*model.PVEConfig, error) {
	var cfg model.PVEConfig
	err := db.DB.First(&cfg).Error
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig updates or creates PVE configuration
func (s *PVEService) SaveConfig(cfg *model.PVEConfig) error {
	// Automatically discover node name via PVE API
	if cfg.Endpoint != "" && cfg.TokenID != "" && cfg.TokenSecret != "" {
		if node, err := s.AutoDiscoverNode(cfg); err == nil && node != "" {
			cfg.DefaultNode = node
		}
	}
	if cfg.DefaultNode == "" {
		cfg.DefaultNode = "pve"
	}

	var existing model.PVEConfig
	err := db.DB.First(&existing).Error
	if err == nil {
		cfg.ID = existing.ID
		cfg.UpdatedAt = time.Now()
		return db.DB.Save(cfg).Error
	}
	cfg.UpdatedAt = time.Now()
	return db.DB.Create(cfg).Error
}

// makeClient creates an HTTP client configured with TLS settings
func (s *PVEService) makeClient(insecure bool) *http.Client {
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: insecure,
		},
		ResponseHeaderTimeout: 10 * time.Second,
	}
	return &http.Client{
		Transport: tr,
		Timeout:   15 * time.Second,
	}
}

// doRequest performs an authenticated request to PVE API
func (s *PVEService) doRequest(cfg *model.PVEConfig, method, path string, bodyData url.Values) ([]byte, error) {
	baseURL := strings.TrimRight(cfg.Endpoint, "/")
	fullURL := fmt.Sprintf("%s%s", baseURL, path)

	var reqBody io.Reader
	if bodyData != nil {
		reqBody = strings.NewReader(bodyData.Encode())
	}

	req, err := http.NewRequest(method, fullURL, reqBody)
	if err != nil {
		return nil, err
	}

	// PVE API Token Header format: PVEAPIToken=USER@REALM!TOKENID=SECRET
	authHeader := fmt.Sprintf("PVEAPIToken=%s=%s", cfg.TokenID, cfg.TokenSecret)
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Accept", "application/json")

	if bodyData != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}

	client := s.makeClient(cfg.InsecureSkipVerify)
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("连接 PVE 服务器失败: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("PVE API 返回错误 (状态码 %d): %s", resp.StatusCode, string(respBytes))
	}

	return respBytes, nil
}

type pveResponse struct {
	Data json.RawMessage `json:"data"`
}

// AutoDiscoverNode queries /api2/json/nodes to find the active node name
func (s *PVEService) AutoDiscoverNode(cfg *model.PVEConfig) (string, error) {
	bytes, err := s.doRequest(cfg, "GET", "/api2/json/nodes", nil)
	if err != nil {
		return "", err
	}
	var nodeResp struct {
		Data []struct {
			Node   string `json:"node"`
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(bytes, &nodeResp); err != nil {
		return "", err
	}
	for _, n := range nodeResp.Data {
		if n.Status == "online" && n.Node != "" {
			return n.Node, nil
		}
	}
	if len(nodeResp.Data) > 0 && nodeResp.Data[0].Node != "" {
		return nodeResp.Data[0].Node, nil
	}
	return "pve", nil
}

// TestConnection tests connectivity and returns PVE version + auto-detected node
func (s *PVEService) TestConnection(cfg *model.PVEConfig) (map[string]interface{}, error) {
	bytes, err := s.doRequest(cfg, "GET", "/api2/json/version", nil)
	if err != nil {
		return nil, err
	}

	var verResp pveResponse
	if err := json.Unmarshal(bytes, &verResp); err != nil {
		return nil, err
	}

	// Auto discover node via API
	detectedNode, err := s.AutoDiscoverNode(cfg)
	if err == nil && detectedNode != "" {
		cfg.DefaultNode = detectedNode
	}

	// Also fetch nodes
	nodeBytes, _ := s.doRequest(cfg, "GET", "/api2/json/nodes", nil)
	var nodeResp pveResponse
	_ = json.Unmarshal(nodeBytes, &nodeResp)

	return map[string]interface{}{
		"success":      true,
		"version":      verResp.Data,
		"nodes":        nodeResp.Data,
		"detectedNode": detectedNode,
	}, nil
}

// GetNodes returns all cluster / standalone nodes
func (s *PVEService) GetNodes() ([]map[string]interface{}, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return nil, errors.New("PVE 配置尚未初始化")
	}

	bytes, err := s.doRequest(cfg, "GET", "/api2/json/nodes", nil)
	if err != nil {
		return nil, err
	}

	var resp struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(bytes, &resp); err != nil {
		return nil, err
	}

	return resp.Data, nil
}

// GetNodeStatus fetches hardware metrics (CPU, RAM, Disk, Uptime)
func (s *PVEService) GetNodeStatus(nodeName string) (*model.PVENodeStatus, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return nil, errors.New("PVE 配置尚未初始化")
	}

	if nodeName == "" {
		nodeName = cfg.DefaultNode
	}
	if nodeName == "" {
		// Try discovering first node
		nodes, err := s.GetNodes()
		if err == nil && len(nodes) > 0 {
			if n, ok := nodes[0]["node"].(string); ok {
				nodeName = n
			}
		}
	}
	if nodeName == "" {
		nodeName = "pve"
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/status", nodeName)
	bytes, err := s.doRequest(cfg, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Data struct {
			Uptime  int64   `json:"uptime"`
			CPU     float64 `json:"cpu"`
			CPUInfo struct {
				CPUs  int    `json:"cpus"`
				Model string `json:"model"`
			} `json:"cpuinfo"`
			Memory struct {
				Total int64 `json:"total"`
				Used  int64 `json:"used"`
				Free  int64 `json:"free"`
			} `json:"memory"`
			RootFS struct {
				Total int64 `json:"total"`
				Used  int64 `json:"used"`
				Free  int64 `json:"free"`
			} `json:"rootfs"`
			KVersion   string `json:"kversion"`
			PVEVersion string `json:"pveversion"`
		} `json:"data"`
	}

	if err := json.Unmarshal(bytes, &raw); err != nil {
		return nil, err
	}

	return &model.PVENodeStatus{
		Node:        nodeName,
		Status:      "online",
		Uptime:      raw.Data.Uptime,
		CPUUsage:    raw.Data.CPU,
		CPUs:        raw.Data.CPUInfo.CPUs,
		MemoryTotal: raw.Data.Memory.Total,
		MemoryUsed:  raw.Data.Memory.Used,
		DiskTotal:   raw.Data.RootFS.Total,
		DiskUsed:    raw.Data.RootFS.Used,
		KVersion:    raw.Data.KVersion,
		PVEVersion:  raw.Data.PVEVersion,
	}, nil
}

// GetGuests lists all QEMU VMs and LXC containers on the node
func (s *PVEService) GetGuests(nodeName string) ([]model.PVEGuest, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return nil, errors.New("PVE 配置尚未初始化")
	}

	if nodeName == "" {
		nodeName = cfg.DefaultNode
	}
	if nodeName == "" {
		nodeName = "pve"
	}

	var guests []model.PVEGuest

	// 1. Fetch QEMU
	qemuBytes, err := s.doRequest(cfg, "GET", fmt.Sprintf("/api2/json/nodes/%s/qemu", nodeName), nil)
	if err == nil {
		var qemuResp struct {
			Data []struct {
				VMID   int     `json:"vmid"`
				Name   string  `json:"name"`
				Status string  `json:"status"`
				CPU    float64 `json:"cpu"`
				CPUs   int     `json:"cpus"`
				Mem    int64   `json:"mem"`
				MaxMem int64   `json:"maxmem"`
				Uptime int64   `json:"uptime"`
				NetIn  int64   `json:"netin"`
				NetOut int64   `json:"netout"`
			} `json:"data"`
		}
		if json.Unmarshal(qemuBytes, &qemuResp) == nil {
			for _, item := range qemuResp.Data {
				guests = append(guests, model.PVEGuest{
					VMID:   item.VMID,
					Name:   item.Name,
					Type:   "qemu",
					Status: item.Status,
					CPU:    item.CPU,
					CPUs:   item.CPUs,
					Mem:    item.Mem,
					MaxMem: item.MaxMem,
					Uptime: item.Uptime,
					NetIn:  item.NetIn,
					NetOut: item.NetOut,
				})
			}
		}
	}

	// 2. Fetch LXC
	lxcBytes, err := s.doRequest(cfg, "GET", fmt.Sprintf("/api2/json/nodes/%s/lxc", nodeName), nil)
	if err == nil {
		var lxcResp struct {
			Data []struct {
				VMID   int     `json:"vmid"`
				Name   string  `json:"name"`
				Status string  `json:"status"`
				CPU    float64 `json:"cpu"`
				CPUs   int     `json:"cpus"`
				Mem    int64   `json:"mem"`
				MaxMem int64   `json:"maxmem"`
				Uptime int64   `json:"uptime"`
				NetIn  int64   `json:"netin"`
				NetOut int64   `json:"netout"`
			} `json:"data"`
		}
		if json.Unmarshal(lxcBytes, &lxcResp) == nil {
			for _, item := range lxcResp.Data {
				guests = append(guests, model.PVEGuest{
					VMID:   item.VMID,
					Name:   item.Name,
					Type:   "lxc",
					Status: item.Status,
					CPU:    item.CPU,
					CPUs:   item.CPUs,
					Mem:    item.Mem,
					MaxMem: item.MaxMem,
					Uptime: item.Uptime,
					NetIn:  item.NetIn,
					NetOut: item.NetOut,
				})
			}
		}
	}

	sort.Slice(guests, func(i, j int) bool {
		return guests[i].VMID < guests[j].VMID
	})

	return guests, nil
}

// ShutdownNode shuts down the PVE host
func (s *PVEService) ShutdownNode(nodeName string) error {
	cfg, err := s.GetConfig()
	if err != nil {
		return errors.New("PVE 配置尚未初始化")
	}

	if nodeName == "" {
		nodeName = cfg.DefaultNode
	}
	if nodeName == "" {
		nodeName = "pve"
	}

	data := url.Values{}
	data.Set("command", "shutdown")

	path := fmt.Sprintf("/api2/json/nodes/%s/status", nodeName)
	_, err = s.doRequest(cfg, "POST", path, data)
	return err
}

// RebootNode reboots the PVE host
func (s *PVEService) RebootNode(nodeName string) error {
	cfg, err := s.GetConfig()
	if err != nil {
		return errors.New("PVE 配置尚未初始化")
	}

	if nodeName == "" {
		nodeName = cfg.DefaultNode
	}
	if nodeName == "" {
		nodeName = "pve"
	}

	data := url.Values{}
	data.Set("command", "reboot")

	path := fmt.Sprintf("/api2/json/nodes/%s/status", nodeName)
	_, err = s.doRequest(cfg, "POST", path, data)
	return err
}

// ControlGuest performs power control on a VM or container
func (s *PVEService) ControlGuest(nodeName string, guestType string, vmid int, action string) error {
	cfg, err := s.GetConfig()
	if err != nil {
		return errors.New("PVE 配置尚未初始化")
	}

	if nodeName == "" {
		nodeName = cfg.DefaultNode
	}
	if nodeName == "" {
		nodeName = "pve"
	}

	// action: "start", "stop", "shutdown", "reboot"
	path := fmt.Sprintf("/api2/json/nodes/%s/%s/%d/status/%s", nodeName, guestType, vmid, action)
	_, err = s.doRequest(cfg, "POST", path, nil)
	return err
}

// StartGuest starts a VM or LXC container
func (s *PVEService) StartGuest(nodeName string, guestType string, vmid int) error {
	return s.ControlGuest(nodeName, guestType, vmid, "start")
}

// ShutdownGuest gracefully shuts down a VM or LXC container
func (s *PVEService) ShutdownGuest(nodeName string, guestType string, vmid int) error {
	return s.ControlGuest(nodeName, guestType, vmid, "shutdown")
}

// RebootGuest reboots a VM or LXC container
func (s *PVEService) RebootGuest(nodeName string, guestType string, vmid int) error {
	return s.ControlGuest(nodeName, guestType, vmid, "reboot")
}

// StopGuest forcefully stops a VM or LXC container
func (s *PVEService) StopGuest(nodeName string, guestType string, vmid int) error {
	return s.ControlGuest(nodeName, guestType, vmid, "stop")
}

// GetOnlineStatus computes overall PVE host online state and readiness
func (s *PVEService) GetOnlineStatus(wolSvc *WOLService) map[string]interface{} {
	// 1. WOL status & bound device
	wolConfigured := false
	wolDeviceBound := false
	var wolDeviceId *uint
	wolDeviceName := ""
	wolDeviceMac := ""

	if wolSvc != nil {
		if wCfg, err := wolSvc.GetConfig(); err == nil && wCfg != nil && strings.TrimSpace(wCfg.Host) != "" {
			wolConfigured = true
		}
	}

	cfg, err := s.GetConfig()
	pveConfigured := err == nil && cfg.Endpoint != "" && cfg.TokenID != ""
	if pveConfigured && cfg.WOLDeviceID != nil && *cfg.WOLDeviceID > 0 {
		wolDeviceId = cfg.WOLDeviceID
		if wolSvc != nil {
			if dev, err := wolSvc.GetDevice(*cfg.WOLDeviceID); err == nil && dev != nil {
				wolDeviceBound = true
				wolDeviceName = dev.Name
				wolDeviceMac = dev.MAC
			}
		}
	}

	// 2. PVE Node status
	pveOnline := false
	nodeName := "pve"
	if pveConfigured {
		if cfg.DefaultNode != "" {
			nodeName = cfg.DefaultNode
		}
		st, err := s.GetNodeStatus(nodeName)
		if err == nil && st != nil && st.Status == "online" {
			pveOnline = true
		}
	}

	return map[string]interface{}{
		"online":         pveOnline,
		"node":           nodeName,
		"pveConfigured":  pveConfigured,
		"wolConfigured":  wolConfigured && wolDeviceBound,
		"wolDeviceBound": wolDeviceBound,
		"wolDeviceId":    wolDeviceId,
		"wolDeviceName":  wolDeviceName,
		"wolDeviceMac":   wolDeviceMac,
	}
}

// WakePVE wakes up the PVE host using the bound WOL device
func (s *PVEService) WakePVE(wolSvc *WOLService) (*WOLResponse, error) {
	cfg, err := s.GetConfig()
	if err != nil || cfg.Endpoint == "" {
		return nil, errors.New("PVE 配置尚未初始化")
	}

	if cfg.WOLDeviceID == nil || *cfg.WOLDeviceID == 0 {
		return nil, errors.New("PVE 节点尚未绑定 WOL 设备，请在系统设置的 PVE 配置中选择绑定的 WOL 设备")
	}

	if wolSvc == nil {
		return nil, errors.New("WOL 服务不可用")
	}

	return wolSvc.WakeDevice(*cfg.WOLDeviceID)
}

