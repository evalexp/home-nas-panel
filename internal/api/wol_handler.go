package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/evalexp/home-nas-panel/internal/service"

	"github.com/gin-gonic/gin"
)

type WOLHandler struct {
	wolSvc *service.WOLService
}

func NewWOLHandler(wolSvc *service.WOLService) *WOLHandler {
	return &WOLHandler{wolSvc: wolSvc}
}

// GetConfig returns current WOL Control configuration
func (h *WOLHandler) GetConfig(c *gin.Context) {
	cfg, err := h.wolSvc.GetConfig()
	if err != nil || strings.TrimSpace(cfg.WakeURL) == "" {
		c.JSON(http.StatusOK, gin.H{
			"configured":    false,
			"wakeUrl":       "",
			"statusUrl":     "",
			"tlsSkipVerify": false,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"configured":    true,
		"wakeUrl":       cfg.WakeURL,
		"statusUrl":     cfg.StatusURL,
		"tlsSkipVerify": cfg.TLSSkipVerify,
		"enabled":       cfg.Enabled,
		"updatedAt":     cfg.UpdatedAt,
	})
}

// SaveConfig updates WOL Control configuration
func (h *WOLHandler) SaveConfig(c *gin.Context) {
	var req struct {
		WakeURL       string `json:"wakeUrl" binding:"required"`
		StatusURL     string `json:"statusUrl" binding:"required"`
		TLSSkipVerify bool   `json:"tlsSkipVerify"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供唤醒和在线检测 Webhook URL"})
		return
	}

	cfg, err := h.wolSvc.SaveConfig(req.WakeURL, req.StatusURL, req.TLSSkipVerify)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, service.ErrInvalidWOLConfig) {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "WOL Control 配置已成功保存",
		"configured":    true,
		"wakeUrl":       cfg.WakeURL,
		"statusUrl":     cfg.StatusURL,
		"tlsSkipVerify": cfg.TLSSkipVerify,
		"updatedAt":     cfg.UpdatedAt,
	})
}

// DeleteConfig removes the saved WOL configuration
func (h *WOLHandler) DeleteConfig(c *gin.Context) {
	if err := h.wolSvc.DeleteConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除配置失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "WOL Control 配置已成功删除",
	})
}

// ListDevices returns all WOL devices
func (h *WOLHandler) ListDevices(c *gin.Context) {
	devices, err := h.wolSvc.ListDevices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取设备列表失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, devices)
}

// ListDeviceStatuses returns online checks independently from the device list.
func (h *WOLHandler) ListDeviceStatuses(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	statuses, err := h.wolSvc.ListDeviceStatuses(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "获取设备在线状态失败"})
		return
	}
	c.JSON(http.StatusOK, statuses)
}

// CreateDevice registers a new WOL device
func (h *WOLHandler) CreateDevice(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
		MAC  string `json:"mac" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的机器名称与 MAC 地址"})
		return
	}

	dev, err := h.wolSvc.CreateDevice(req.Name, req.MAC)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dev)
}

// UpdateDevice updates an existing WOL device
func (h *WOLHandler) UpdateDevice(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的设备 ID"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
		MAC  string `json:"mac" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的机器名称与 MAC 地址"})
		return
	}

	dev, err := h.wolSvc.UpdateDevice(uint(id), req.Name, req.MAC)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dev)
}

// DeleteDevice deletes a registered WOL device
func (h *WOLHandler) DeleteDevice(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的设备 ID"})
		return
	}

	if err := h.wolSvc.DeleteDevice(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除设备失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "设备已成功删除"})
}

// WakeDevice triggers wake on a specific WOL device by ID
func (h *WOLHandler) WakeDevice(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的设备 ID"})
		return
	}

	res, err := h.wolSvc.WakeDevice(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}

// TriggerWake triggers wake via deviceId or mac
func (h *WOLHandler) TriggerWake(c *gin.Context) {
	var req struct {
		DeviceID *uint  `json:"deviceId"`
		MAC      string `json:"mac"`
	}
	_ = c.ShouldBindJSON(&req)

	var res *service.WOLResponse
	var err error

	if req.DeviceID != nil && *req.DeviceID > 0 {
		res, err = h.wolSvc.WakeDevice(*req.DeviceID)
	} else if strings.TrimSpace(req.MAC) != "" {
		res, err = h.wolSvc.WakeMAC(req.MAC)
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供唤醒的目标设备 ID 或 MAC 地址"})
		return
	}

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, res)
}
