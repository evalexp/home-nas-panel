package api

import (
	"net/http"
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

// GetConfig returns current WOL Webhook configuration
func (h *WOLHandler) GetConfig(c *gin.Context) {
	cfg, err := h.wolSvc.GetConfig()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"configured": false,
			"webhookUrl": "",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"configured":         true,
		"webhookUrl":         cfg.WebhookURL,
		"insecureSkipVerify": cfg.InsecureSkipVerify,
		"enabled":            cfg.Enabled,
		"updatedAt":          cfg.UpdatedAt,
	})
}

// SaveConfig updates WOL Webhook configuration
func (h *WOLHandler) SaveConfig(c *gin.Context) {
	var req struct {
		WebhookURL         string `json:"webhookUrl" binding:"required"`
		InsecureSkipVerify bool   `json:"insecureSkipVerify"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供有效的 Webhook 地址"})
		return
	}

	cfg, err := h.wolSvc.SaveConfig(req.WebhookURL, req.InsecureSkipVerify)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":            "开机 Webhook 配置已保存",
		"configured":         true,
		"webhookUrl":         cfg.WebhookURL,
		"insecureSkipVerify": cfg.InsecureSkipVerify,
		"updatedAt":          cfg.UpdatedAt,
	})
}

// DeleteConfig removes the saved WOL Webhook configuration
func (h *WOLHandler) DeleteConfig(c *gin.Context) {
	if err := h.wolSvc.DeleteConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除配置失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "开机 Webhook 配置已成功删除",
	})
}

// TriggerWake triggers the WOL Webhook to wake up host
func (h *WOLHandler) TriggerWake(c *gin.Context) {
	var req struct {
		WebhookURL         string `json:"webhookUrl"`
		InsecureSkipVerify bool   `json:"insecureSkipVerify"`
	}
	_ = c.ShouldBindJSON(&req)

	var res *service.WOLResponse
	var err error

	if strings.TrimSpace(req.WebhookURL) != "" {
		res, err = h.wolSvc.TriggerWakeURL(req.WebhookURL, req.InsecureSkipVerify)
	} else {
		res, err = h.wolSvc.TriggerWake()
	}

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	msg := res.Message
	if msg == "" {
		msg = "Wake-on-LAN magic packet broadcasted successfully"
	}

	c.JSON(http.StatusOK, gin.H{
		"message": msg,
		"mac":     res.MAC,
	})
}
