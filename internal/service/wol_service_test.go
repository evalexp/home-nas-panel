package service

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
)

func TestSendWakePacket(t *testing.T) {
	// 1. Success case: Mock HTTP server receiving the request
	tsSuccess := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("expected GET method, got %s", r.Method)
		}
		if r.URL.Path != "/wakeup" {
			t.Errorf("expected /wakeup path, got %s", r.URL.Path)
		}
		mac := r.URL.Query().Get("mac")
		if mac != "AA:BB:CC:DD:EE:FF" {
			t.Errorf("expected mac parameter 'AA:BB:CC:DD:EE:FF', got '%s'", mac)
		}
		token := r.URL.Query().Get("token")
		if token != "my_secret_token" {
			t.Errorf("expected token 'my_secret_token', got '%s'", token)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Wake-on-LAN magic packet broadcasted successfully",
			"mac":     mac,
		})
	}))
	defer tsSuccess.Close()

	u, err := url.Parse(tsSuccess.URL)
	if err != nil {
		t.Fatalf("failed to parse test server URL: %v", err)
	}
	port, _ := strconv.Atoi(u.Port())

	svc := NewWOLService()
	cfg := &model.WOLConfig{
		Host:           u.Hostname(),
		Port:           port,
		UseTLS:         false,
		PacketTemplate: fmt.Sprintf("GET /wakeup?token=my_secret_token&mac={mac} HTTP/1.1\r\nHost: %s:%d\r\nConnection: close\r\n\r\n", u.Hostname(), port),
	}

	res, err := svc.SendWakePacket(cfg, "AA:BB:CC:DD:EE:FF")
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if !res.Success || res.MAC != "AA:BB:CC:DD:EE:FF" {
		t.Errorf("unexpected response: %+v", res)
	}

	// 2. Failure case from remote server (success: false)
	tsFail := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "invalid or missing authentication token",
		})
	}))
	defer tsFail.Close()

	uFail, _ := url.Parse(tsFail.URL)
	portFail, _ := strconv.Atoi(uFail.Port())

	cfgFail := &model.WOLConfig{
		Host:           uFail.Hostname(),
		Port:           portFail,
		UseTLS:         false,
		PacketTemplate: fmt.Sprintf("GET /wakeup?token=bad_token&mac={MAC} HTTP/1.1\r\nHost: %s:%d\r\nConnection: close\r\n\r\n", uFail.Hostname(), portFail),
	}

	_, err = svc.SendWakePacket(cfgFail, "AA:BB:CC:DD:EE:FF")
	if err == nil {
		t.Fatalf("expected error for unauthorized token, got nil")
	}
	if err.Error() != "WOL 唤醒失败: invalid or missing authentication token" {
		t.Errorf("expected specific error message, got %v", err)
	}
}

func TestWOLConfigAndDeviceCRUD(t *testing.T) {
	tmpDB := t.TempDir() + "/test_wol.db"
	_, err := db.InitDB(tmpDB)
	if err != nil {
		t.Fatalf("failed to init test db: %v", err)
	}

	svc := NewWOLService()

	// 1. Config CRUD
	cfg, err := svc.SaveConfig("192.168.1.1", 8080, false, false, "GET /wakeup?mac=MAGICSTRING HTTP/1.1\r\nHost: 192.168.1.1:8080\r\n\r\n")
	if err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}
	if cfg.Host != "192.168.1.1" || cfg.Port != 8080 {
		t.Errorf("unexpected saved config: %+v", cfg)
	}

	loadedCfg, err := svc.GetConfig()
	if err != nil {
		t.Fatalf("GetConfig failed: %v", err)
	}
	if loadedCfg.Host != "192.168.1.1" {
		t.Errorf("expected host 192.168.1.1, got %s", loadedCfg.Host)
	}

	// 2. Device CRUD
	dev1, err := svc.CreateDevice("PVE 主机", "11:22:33:44:55:66")
	if err != nil {
		t.Fatalf("CreateDevice dev1 failed: %v", err)
	}
	if dev1.ID == 0 || dev1.Name != "PVE 主机" {
		t.Errorf("unexpected created device: %+v", dev1)
	}

	dev2, err := svc.CreateDevice("台式机", "AA:BB:CC:DD:EE:FF")
	if err != nil {
		t.Fatalf("CreateDevice dev2 failed: %v", err)
	}

	list, err := svc.ListDevices()
	if err != nil {
		t.Fatalf("ListDevices failed: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 devices, got %d", len(list))
	}

	// Update device
	updated, err := svc.UpdateDevice(dev1.ID, "PVE 主宿主机", "11:22:33:44:55:77")
	if err != nil {
		t.Fatalf("UpdateDevice failed: %v", err)
	}
	if updated.Name != "PVE 主宿主机" || updated.MAC != "11:22:33:44:55:77" {
		t.Errorf("unexpected updated device: %+v", updated)
	}

	// Delete device
	if err := svc.DeleteDevice(dev2.ID); err != nil {
		t.Fatalf("DeleteDevice failed: %v", err)
	}

	listAfter, err := svc.ListDevices()
	if err != nil {
		t.Fatalf("ListDevices after delete failed: %v", err)
	}
	if len(listAfter) != 1 {
		t.Errorf("expected 1 device, got %d", len(listAfter))
	}

	// Delete config
	if err := svc.DeleteConfig(); err != nil {
		t.Fatalf("DeleteConfig failed: %v", err)
	}
	_, err = svc.GetConfig()
	if err == nil {
		t.Errorf("expected error after DeleteConfig, got nil")
	}
}

func TestUpgradeFromV010Database(t *testing.T) {
	tmpDB := t.TempDir() + "/v010_upgrade.db"

	// 1. Manually initialize SQLite database with v0.1.0 legacy wol_configs schema
	rawDB, err := db.InitDB(tmpDB)
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}

	// Drop wol_configs created by AutoMigrate and re-create it with v0.1.0 structure
	if err := rawDB.Exec("DROP TABLE IF EXISTS wol_configs").Error; err != nil {
		t.Fatalf("failed to drop table: %v", err)
	}
	v010Schema := `CREATE TABLE wol_configs (
		id integer PRIMARY KEY AUTOINCREMENT,
		webhook_url text NOT NULL,
		enabled numeric DEFAULT 1,
		insecure_skip_verify numeric DEFAULT 0,
		created_at datetime,
		updated_at datetime
	);`
	if err := rawDB.Exec(v010Schema).Error; err != nil {
		t.Fatalf("failed to create v0.1.0 schema: %v", err)
	}
	if err := rawDB.Exec("INSERT INTO wol_configs (webhook_url) VALUES ('http://192.168.1.1/wakeup');").Error; err != nil {
		t.Fatalf("failed to insert legacy row: %v", err)
	}

	// 2. Now run AutoMigrate (as would happen on application startup with the new version)
	_, err = db.InitDB(tmpDB)
	if err != nil {
		t.Fatalf("AutoMigrate failed on existing v0.1.0 database: %v", err)
	}

	// 3. Verify service works cleanly
	svc := NewWOLService()
	rawTmpl := "GET /test?mac={mac} HTTP/1.1\r\n\r\n"
	cfg, err := svc.SaveConfig("10.0.0.1", 8080, false, false, rawTmpl)
	if err != nil {
		t.Fatalf("SaveConfig failed after migration: %v", err)
	}
	if cfg.Host != "10.0.0.1" {
		t.Errorf("expected host 10.0.0.1, got %s", cfg.Host)
	}
	if cfg.PacketTemplate != rawTmpl {
		t.Errorf("expected PacketTemplate to preserve trailing CRLFs %q, got %q", rawTmpl, cfg.PacketTemplate)
	}
}

func TestRawPacketNoNormalization(t *testing.T) {
	// A raw TCP server listening and reading bytes directly
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer l.Close()

	port := l.Addr().(*net.TCPAddr).Port

	receivedChan := make(chan []byte, 1)
	go func() {
		conn, err := l.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		buf := make([]byte, 1024)
		n, _ := conn.Read(buf)
		receivedChan <- buf[:n]
		_, _ = conn.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"))
	}()

	svc := NewWOLService()
	rawTemplate := "GET /wake?mac={mac}&other={port} HTTP/1.1\nHost: 127.0.0.1\n\n"
	cfg := &model.WOLConfig{
		Host:           "127.0.0.1",
		Port:           port,
		PacketTemplate: rawTemplate,
	}

	_, err = svc.SendWakePacket(cfg, "AA:BB:CC:DD:EE:FF")
	if err != nil {
		t.Fatalf("SendWakePacket failed: %v", err)
	}

	received := string(<-receivedChan)
	// Expected: {mac} is replaced, but {port} is NOT replaced, and \n is NOT normalized to \r\n!
	expected := "GET /wake?mac=AA:BB:CC:DD:EE:FF&other={port} HTTP/1.1\nHost: 127.0.0.1\n\n"
	if received != expected {
		t.Errorf("expected raw template without normalization:\n%q\ngot:\n%q", expected, received)
	}
}

