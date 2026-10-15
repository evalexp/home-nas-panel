package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/evalexp/home-nas-panel/internal/model"
	"github.com/evalexp/home-nas-panel/internal/service"

	"github.com/gin-gonic/gin"
)

type PVEHandler struct {
	pveSvc *service.PVEService
	wolSvc *service.WOLService
}

func NewPVEHandler(pveSvc *service.PVEService, wolSvc *service.WOLService) *PVEHandler {
	return &PVEHandler{
		pveSvc: pveSvc,
		wolSvc: wolSvc,
	}
}

// GetConfig returns PVE configuration with masked secret
func (h *PVEHandler) GetConfig(c *gin.Context) {
	cfg, err := h.pveSvc.GetConfig()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"configured": false})
		return
	}

	maskedSecret := ""
	if len(cfg.TokenSecret) > 8 {
		maskedSecret = cfg.TokenSecret[:4] + "****" + cfg.TokenSecret[len(cfg.TokenSecret)-4:]
	} else if cfg.TokenSecret != "" {
		maskedSecret = "********"
	}

	c.JSON(http.StatusOK, gin.H{
		"configured":         true,
		"endpoint":           cfg.Endpoint,
		"tokenId":            cfg.TokenID,
		"tokenSecret":        maskedSecret,
		"insecureSkipVerify": cfg.InsecureSkipVerify,
		"defaultNode":        cfg.DefaultNode,
		"wolDeviceId":        cfg.WOLDeviceID,
		"enabled":            cfg.Enabled,
		"updatedAt":          cfg.UpdatedAt,
	})
}

// SaveConfig saves or updates PVE configuration
func (h *PVEHandler) SaveConfig(c *gin.Context) {
	var req struct {
		Endpoint           string `json:"endpoint" binding:"required"`
		TokenID            string `json:"tokenId" binding:"required"`
		TokenSecret        string `json:"tokenSecret"`
		InsecureSkipVerify bool   `json:"insecureSkipVerify"`
		WOLDeviceID        *uint  `json:"wolDeviceId"`
		Enabled            bool   `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，请提供完整的 PVE 地址与 Token ID"})
		return
	}

	// Validate bound WOL device if provided
	if req.WOLDeviceID != nil && *req.WOLDeviceID > 0 {
		if _, err := h.wolSvc.GetDevice(*req.WOLDeviceID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "所选的 WOL 绑定设备不存在"})
			return
		}
	}

	// Normalize endpoint
	endpoint := strings.TrimRight(req.Endpoint, "/")
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		endpoint = "https://" + endpoint
	}

	existing, _ := h.pveSvc.GetConfig()
	secret := req.TokenSecret
	if (secret == "" || strings.Contains(secret, "****")) && existing != nil {
		secret = existing.TokenSecret
	}

	if secret == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的 Token Secret (UUID)"})
		return
	}

	cfg := model.PVEConfig{
		Endpoint:           endpoint,
		TokenID:            req.TokenID,
		TokenSecret:        secret,
		InsecureSkipVerify: req.InsecureSkipVerify,
		WOLDeviceID:        req.WOLDeviceID,
		Enabled:            req.Enabled,
	}

	if err := h.pveSvc.SaveConfig(&cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存配置失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "PVE 配置保存成功",
		"detectedNode": cfg.DefaultNode,
	})
}

// TestConnection tests connectivity with PVE
func (h *PVEHandler) TestConnection(c *gin.Context) {
	var req struct {
		Endpoint           string `json:"endpoint"`
		TokenID            string `json:"tokenId"`
		TokenSecret        string `json:"tokenSecret"`
		InsecureSkipVerify bool   `json:"insecureSkipVerify"`
	}
	_ = c.ShouldBindJSON(&req)

	var cfg *model.PVEConfig
	if req.Endpoint != "" && req.TokenID != "" && req.TokenSecret != "" {
		endpoint := strings.TrimRight(req.Endpoint, "/")
		if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
			endpoint = "https://" + endpoint
		}
		cfg = &model.PVEConfig{
			Endpoint:           endpoint,
			TokenID:            req.TokenID,
			TokenSecret:        req.TokenSecret,
			InsecureSkipVerify: req.InsecureSkipVerify,
		}
	} else {
		var err error
		cfg, err = h.pveSvc.GetConfig()
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先提供 PVE 连接信息"})
			return
		}
	}

	res, err := h.pveSvc.TestConnection(cfg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}

// GetNodes returns PVE nodes list
func (h *PVEHandler) GetNodes(c *gin.Context) {
	nodes, err := h.pveSvc.GetNodes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, nodes)
}

// GetStatus returns primary node metrics (CPU, Memory, Disk, Uptime)
func (h *PVEHandler) GetStatus(c *gin.Context) {
	node := c.Query("node")
	status, err := h.pveSvc.GetNodeStatus(node)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, status)
}

// GetGuests returns VMs and LXCs
func (h *PVEHandler) GetGuests(c *gin.Context) {
	node := c.Query("node")
	guests, err := h.pveSvc.GetGuests(node)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, guests)
}

// ShutdownNode gracefully shuts down the PVE host
func (h *PVEHandler) ShutdownNode(c *gin.Context) {
	var req struct {
		Node    string `json:"node"`
		Confirm bool   `json:"confirm" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || !req.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "关机操作需要明确确认 (confirm: true)"})
		return
	}

	if err := h.pveSvc.ShutdownNode(req.Node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "关机指令发送失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "已向 PVE 宿主机下发关机指令，系统正在安全关机...",
		"node":    req.Node,
	})
}

// RebootNode reboots the PVE host
func (h *PVEHandler) RebootNode(c *gin.Context) {
	var req struct {
		Node    string `json:"node"`
		Confirm bool   `json:"confirm" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || !req.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "重启操作需要明确确认 (confirm: true)"})
		return
	}

	if err := h.pveSvc.RebootNode(req.Node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重启指令发送失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "已向 PVE 宿主机下发重启指令，系统正在重启...",
		"node":    req.Node,
	})
}

// ControlGuest performs power control on a VM or container
// StartGuest starts a VM or LXC container
func (h *PVEHandler) StartGuest(c *gin.Context) {
	guestType := c.Param("type")
	vmid, err := strconv.Atoi(c.Param("vmid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 VMID"})
		return
	}
	node := c.Query("node")
	if err := h.pveSvc.StartGuest(node, guestType, vmid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已向虚拟机/容器下发启动指令", "vmid": vmid})
}

// ShutdownGuest gracefully shuts down a VM or LXC container
func (h *PVEHandler) ShutdownGuest(c *gin.Context) {
	guestType := c.Param("type")
	vmid, err := strconv.Atoi(c.Param("vmid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 VMID"})
		return
	}
	node := c.Query("node")
	if err := h.pveSvc.ShutdownGuest(node, guestType, vmid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已向虚拟机/容器下发关机指令", "vmid": vmid})
}

// RebootGuest reboots a VM or LXC container
func (h *PVEHandler) RebootGuest(c *gin.Context) {
	guestType := c.Param("type")
	vmid, err := strconv.Atoi(c.Param("vmid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 VMID"})
		return
	}
	node := c.Query("node")
	if err := h.pveSvc.RebootGuest(node, guestType, vmid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已向虚拟机/容器下发重启指令", "vmid": vmid})
}

// StopGuest forcefully stops a VM or LXC container
func (h *PVEHandler) StopGuest(c *gin.Context) {
	guestType := c.Param("type")
	vmid, err := strconv.Atoi(c.Param("vmid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 VMID"})
		return
	}
	node := c.Query("node")
	if err := h.pveSvc.StopGuest(node, guestType, vmid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已向虚拟机/容器下发强制停止指令", "vmid": vmid})
}

// ControlGuest performs power control on a VM or container
func (h *PVEHandler) ControlGuest(c *gin.Context) {
	guestType := c.Param("type") // "qemu" or "lxc"
	vmidStr := c.Param("vmid")
	action := c.Param("action") // "start", "stop", "shutdown", "reboot"
	node := c.Query("node")

	vmid, err := strconv.Atoi(vmidStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 VMID"})
		return
	}

	if err := h.pveSvc.ControlGuest(node, guestType, vmid, action); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "操作指令已发送",
		"vmid":    vmid,
		"action":  action,
	})
}

// GetOnlineStatus returns the PVE host online readiness status
func (h *PVEHandler) GetOnlineStatus(c *gin.Context) {
	state := h.pveSvc.GetOnlineStatus(h.wolSvc)
	c.JSON(http.StatusOK, state)
}

// Wake triggers WOL to wake up PVE host via bound WOL device (Power on)
func (h *PVEHandler) Wake(c *gin.Context) {
	res, err := h.pveSvc.WakePVE(h.wolSvc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	msg := res.Message
	if msg == "" {
		msg = "已成功向绑定的 WOL 设备发送唤醒指令！"
	}

	c.JSON(http.StatusOK, gin.H{
		"message": msg,
		"mac":     res.MAC,
	})
}
