package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/evalexp/home-nas-panel/internal/config"
	"github.com/evalexp/home-nas-panel/internal/service"

	"github.com/gin-gonic/gin"
)

func SetupRouter(
	cfg *config.Config,
	authSvc *service.AuthService,
	passkeySvc *service.PasskeyService,
	pveSvc *service.PVEService,
	navSvc *service.NavService,
	wolSvc *service.WOLService,
) *gin.Engine {
	r := gin.Default()

	// Global CORS
	r.Use(CORSMiddleware())

	authH := NewAuthHandler(authSvc, passkeySvc)
	pveH := NewPVEHandler(pveSvc, wolSvc)
	navH := NewNavHandler(navSvc)
	wolH := NewWOLHandler(wolSvc)

	api := r.Group("/api")
	{
		// Public Auth
		auth := api.Group("/auth")
		{
			auth.GET("/status", authH.GetStatus)
			auth.POST("/register", authH.Register)
			auth.POST("/login", authH.Login)
			auth.POST("/passkey/login/begin", authH.PasskeyLoginBegin)
			auth.POST("/passkey/login/finish", authH.PasskeyLoginFinish)
		}

		// Protected Routes
		protected := api.Group("")
		protected.Use(AuthMiddleware(authSvc))
		{
			// Auth profile & Passkey management
			protected.GET("/auth/me", authH.Me)
			protected.POST("/auth/passkey/register/begin", authH.PasskeyRegisterBegin)
			protected.POST("/auth/passkey/register/finish", authH.PasskeyRegisterFinish)
			protected.DELETE("/auth/passkey/:id", authH.DeletePasskey)

			// PVE Management
			pve := protected.Group("/pve")
			{
				pve.GET("/online", pveH.GetOnlineStatus)
				pve.GET("/config", pveH.GetConfig)
				pve.POST("/config", pveH.SaveConfig)
				pve.POST("/test", pveH.TestConnection)
				pve.GET("/nodes", pveH.GetNodes)
				pve.GET("/status", pveH.GetStatus)
				pve.GET("/guests", pveH.GetGuests)
				pve.POST("/start", pveH.Wake)
				pve.POST("/wake", pveH.Wake)
				pve.POST("/shutdown", pveH.ShutdownNode)
				pve.POST("/reboot", pveH.RebootNode)
				pve.POST("/guests/:type/:vmid/start", pveH.StartGuest)
				pve.POST("/guests/:type/:vmid/shutdown", pveH.ShutdownGuest)
				pve.POST("/guests/:type/:vmid/reboot", pveH.RebootGuest)
				pve.POST("/guests/:type/:vmid/stop", pveH.StopGuest)
				pve.POST("/guests/:type/:vmid/:action", pveH.ControlGuest)
			}

			// Wake-on-LAN Webhook
			wol := protected.Group("/wol")
			{
				wol.GET("/config", wolH.GetConfig)
				wol.POST("/config", wolH.SaveConfig)
				wol.DELETE("/config", wolH.DeleteConfig)
				wol.POST("/wake", wolH.TriggerWake)
			}

			// Nav Panel
			nav := protected.Group("/nav")
			{
				nav.GET("", navH.List)
				nav.POST("", navH.Create)
				nav.PUT("/:id", navH.Update)
				nav.DELETE("/:id", navH.Delete)
				nav.POST("/reorder", navH.Reorder)
				nav.GET("/icons", navH.ListIcons)
				nav.POST("/icons", navH.CreateIcon)
				nav.DELETE("/icons/:id", navH.DeleteIcon)
				nav.POST("/icons/fetch", navH.FetchIcon)
			}
		}
	}

	// Serve Frontend Static files if dist directory exists
	frontendDist := filepath.Join("frontend", "dist")
	if stat, err := os.Stat(frontendDist); err == nil && stat.IsDir() {
		r.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			// If file exists in frontendDist, serve it directly
			targetFile := filepath.Join(frontendDist, filepath.Clean(path))
			if info, err := os.Stat(targetFile); err == nil && !info.IsDir() {
				c.File(targetFile)
				return
			}
			// API routes 404
			if strings.HasPrefix(path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "接口不存在"})
				return
			}
			// SPA fallback
			c.File(filepath.Join(frontendDist, "index.html"))
		})
	}

	return r
}
