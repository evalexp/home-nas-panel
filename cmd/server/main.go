package main

import (
	"fmt"
	"log"

	"github.com/evalexp/home-nas-panel/internal/api"
	"github.com/evalexp/home-nas-panel/internal/config"
	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/service"
)

func main() {
	cfg := config.LoadConfig()

	// Initialize DB
	_, err := db.InitDB(cfg.DBPath)
	if err != nil {
		log.Fatalf("无法初始化数据库: %v", err)
	}

	// Initialize Services
	authSvc := service.NewAuthService(cfg)
	passkeySvc := service.NewPasskeyService(cfg)
	pveSvc := service.NewPVEService()
	navSvc := service.NewNavService()
	wolSvc := service.NewWOLService()

	// Setup Router
	r := api.SetupRouter(cfg, authSvc, passkeySvc, pveSvc, navSvc, wolSvc)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Home NAS Panel 服务已启动: http://localhost%s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
