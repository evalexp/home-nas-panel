package api

import (
	"net/http"
	"strconv"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
	"github.com/evalexp/home-nas-panel/internal/service"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authSvc    *service.AuthService
	passkeySvc *service.PasskeyService
}

func NewAuthHandler(authSvc *service.AuthService, passkeySvc *service.PasskeyService) *AuthHandler {
	return &AuthHandler{
		authSvc:    authSvc,
		passkeySvc: passkeySvc,
	}
}

// GetStatus checks if the system has been initialized (admin created)
func (h *AuthHandler) GetStatus(c *gin.Context) {
	hasAdmin, err := h.authSvc.CheckIfUserExists()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var hasPasskey bool
	if hasAdmin {
		var count int64
		db.DB.Model(&model.PasskeyCredential{}).Count(&count)
		hasPasskey = count > 0
	}

	c.JSON(http.StatusOK, gin.H{
		"initialized": hasAdmin,
		"hasPasskey":  hasPasskey,
	})
}

// Register creates the initial administrator account
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名和密码不能为空且密码至少6位"})
		return
	}

	user, err := h.authSvc.RegisterAdmin(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authSvc.GenerateToken(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成凭证失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "管理员创建成功",
		"token":   token,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
		},
	})
}

// Login performs traditional password authentication
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供用户名和密码"})
		return
	}

	user, token, err := h.authSvc.LoginWithPassword(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "登录成功",
		"token":   token,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"passkeys": user.Passkeys,
		},
	})
}

// Me returns current user profile and registered passkeys
func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetUint("userId")
	var user model.User
	if err := db.DB.Preload("Passkeys").First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":        user.ID,
		"username":  user.Username,
		"passkeys":  user.Passkeys,
		"createdAt": user.CreatedAt,
	})
}

// PasskeyRegisterBegin generates WebAuthn creation options
func (h *AuthHandler) PasskeyRegisterBegin(c *gin.Context) {
	userID := c.GetUint("userId")
	var user model.User
	if err := db.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	creation, sessionID, err := h.passkeySvc.BeginRegistration(c.Request, &user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"options":   creation,
		"sessionId": sessionID,
	})
}

// PasskeyRegisterFinish validates credential creation response and saves Passkey
func (h *AuthHandler) PasskeyRegisterFinish(c *gin.Context) {
	userID := c.GetUint("userId")
	var user model.User
	if err := db.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	sessionID := c.Query("sessionId")
	if sessionID == "" {
		sessionID = c.GetHeader("X-Session-ID")
	}
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少会话标识 sessionId"})
		return
	}

	deviceName := c.Query("deviceName")
	if deviceName == "" {
		deviceName = "我的设备"
	}

	cred, err := h.passkeySvc.FinishRegistration(c.Request, &user, sessionID, deviceName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Passkey 绑定成功",
		"credential": cred,
	})
}

// PasskeyLoginBegin initiates Passkey authentication challenge
func (h *AuthHandler) PasskeyLoginBegin(c *gin.Context) {
	username := c.Query("username")

	assertion, sessionID, err := h.passkeySvc.BeginLogin(c.Request, username)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"options":   assertion,
		"sessionId": sessionID,
	})
}

// PasskeyLoginFinish validates assertion response and returns JWT
func (h *AuthHandler) PasskeyLoginFinish(c *gin.Context) {
	sessionID := c.Query("sessionId")
	if sessionID == "" {
		sessionID = c.GetHeader("X-Session-ID")
	}
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少会话标识 sessionId"})
		return
	}

	username := c.Query("username")

	user, err := h.passkeySvc.FinishLogin(c.Request, sessionID, username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	token, err := h.authSvc.GenerateToken(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成凭证失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Passkey 登录成功",
		"token":   token,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
		},
	})
}

// DeletePasskey removes an enrolled Passkey
func (h *AuthHandler) DeletePasskey(c *gin.Context) {
	userID := c.GetUint("userId")
	idParam := c.Param("id")
	passkeyID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 Passkey ID"})
		return
	}

	if err := h.passkeySvc.DeletePasskey(userID, uint(passkeyID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Passkey 已删除"})
}
