package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const wolTestMAC = "aa:bb:cc:dd:ee:ff"

// db.DB is global, so database tests and their subtests must remain sequential.
func newWOLTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previous := db.DB
	database, err := db.InitDB(filepath.Join(t.TempDir(), "wol.db"))
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	closeWOLTestDB(t, database)
	t.Cleanup(func() { db.DB = previous })
	return database
}

func closeWOLTestDB(t *testing.T, database *gorm.DB) {
	t.Helper()
	connection, err := database.DB()
	if err != nil {
		t.Fatalf("get SQL connection: %v", err)
	}
	t.Cleanup(func() {
		if err := connection.Close(); err != nil {
			t.Errorf("close test database: %v", err)
		}
	})
}

func assertWOLStatus(t *testing.T, result WOLDeviceStatus, deviceID uint, status string, started time.Time) {
	t.Helper()
	if result.DeviceID != deviceID || result.Status != status {
		t.Errorf("status = %+v, want device %d with status %q", result, deviceID, status)
	}
	if result.CheckedAt.Before(started) || result.CheckedAt.After(time.Now()) {
		t.Errorf("CheckedAt = %v, want time between %v and now", result.CheckedAt, started)
	}
	if status == "unknown" && result.Error == "" {
		t.Error("unknown status must explain the check failure")
	}
	if status != "unknown" && result.Error != "" {
		t.Errorf("successful status check has error: %s", result.Error)
	}
}

func TestWebhookGETAndMACReplacement(t *testing.T) {
	for _, endpoint := range []string{"/devices/{mac}/check", "/check?mac={mac}&token=test-token", "/devices/{mac}/check?mac={mac}"} {
		t.Run(endpoint, func(t *testing.T) {
			requests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				if r.Method != http.MethodGet {
					t.Errorf("method = %s, want GET", r.Method)
				}
				if strings.Contains(endpoint, "/devices/") && r.URL.Path != "/devices/"+wolTestMAC+"/check" {
					t.Errorf("path = %q, MAC placeholder not replaced", r.URL.Path)
				}
				if strings.Contains(endpoint, "mac=") && r.URL.Query().Get("mac") != wolTestMAC {
					t.Errorf("query MAC = %q", r.URL.Query().Get("mac"))
				}
				if strings.Contains(endpoint, "token=") && r.URL.Query().Get("token") != "test-token" {
					t.Error("unrelated query parameter changed")
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = fmt.Fprintf(w, `{"success":true,"message":"Device online status checked","mac":%q,"online":false}`, wolTestMAC)
			}))
			defer server.Close()
			cfg := &model.WOLConfig{WakeURL: server.URL + endpoint, StatusURL: server.URL + endpoint}
			svc := NewWOLService()
			response, err := svc.SendWakeWebhook(cfg, wolTestMAC)
			if err != nil {
				t.Fatalf("SendWakeWebhook: %v", err)
			}
			if response == nil || !response.Success || response.MAC != wolTestMAC {
				t.Fatalf("unexpected wake response: %+v", response)
			}
			started := time.Now()
			result := svc.checkDeviceStatus(context.Background(), cfg, model.WOLDevice{ID: 42, MAC: wolTestMAC})
			assertWOLStatus(t, result, 42, "offline", started)
			if requests != 2 {
				t.Errorf("requests = %d, want one wake and one status GET", requests)
			}
		})
	}
}

func TestSendWakeWebhookResponses(t *testing.T) {
	cases := []struct {
		name    string
		code    int
		body    string
		wantErr bool
	}{
		{"success", 200, `{"success":true,"message":"awake"}`, false},
		{"explicit failure", 200, `{"success":false,"error":"denied"}`, true},
		{"empty 200", 200, "", false},
		{"empty 204", 204, "", false},
		{"empty 202", 202, "", false},
		{"400 despite success", 400, `{"success":true}`, true},
		{"401 despite success", 401, `{"success":true}`, true},
		{"404 despite success", 404, `{"success":true}`, true},
		{"500 despite success", 500, `{"success":true}`, true},
		{"503 despite success", 503, `{"success":true}`, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.code)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			response, err := NewWOLService().SendWakeWebhook(&model.WOLConfig{WakeURL: server.URL + "/wake?mac={mac}"}, wolTestMAC)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected failure, got response %+v", response)
				}
				return
			}
			if err != nil || response == nil || !response.Success || response.MAC != wolTestMAC {
				t.Fatalf("response = %+v, err = %v", response, err)
			}
			if tc.name == "success" && response.Message != "awake" {
				t.Errorf("message = %q, want awake", response.Message)
			}
		})
	}
}

func TestWOLDeviceStatusResponses(t *testing.T) {
	cases := []struct {
		name   string
		code   int
		body   string
		status string
	}{
		{"online", 200, `{"success":true,"message":"Device online status checked","mac":"aa:bb:cc:dd:ee:ff","online":true}`, "online"},
		{"offline user example", 200, `{"success":true,"message":"Device online status checked","mac":"aa:bb:cc:dd:ee:ff","online":false}`, "offline"},
		{"missing online", 200, `{"success":true}`, "unknown"},
		{"null online", 200, `{"success":true,"online":null}`, "unknown"},
		{"string online", 200, `{"success":true,"online":"false"}`, "unknown"},
		{"invalid JSON", 200, `{"online":`, "unknown"},
		{"empty body", 204, "", "unknown"},
		{"failure with online true", 200, `{"success":false,"online":true}`, "unknown"},
		{"failure with online false", 200, `{"success":false,"online":false}`, "unknown"},
		{"HTTP client error", 404, `{"success":true,"online":false}`, "unknown"},
		{"HTTP server error", 500, `{"success":true,"online":true}`, "unknown"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.code)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			started := time.Now()
			result := NewWOLService().checkDeviceStatus(context.Background(), &model.WOLConfig{StatusURL: server.URL + "/status?mac={mac}"}, model.WOLDevice{ID: 7, MAC: wolTestMAC})
			assertWOLStatus(t, result, 7, tc.status, started)
		})
	}
}

func TestWebhookTLSSharedSkipVerify(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil || r.Method != http.MethodGet || r.URL.Query().Get("mac") != wolTestMAC {
			t.Errorf("expected HTTPS GET with replaced MAC: %s %s", r.Method, r.URL)
		}
		_, _ = w.Write([]byte(`{"success":true,"online":true}`))
	}))
	defer server.Close()
	svc := NewWOLService()
	cfg := &model.WOLConfig{WakeURL: server.URL + "/wake?mac={mac}", StatusURL: server.URL + "/status?mac={mac}"}
	device := model.WOLDevice{ID: 1, MAC: wolTestMAC}
	if _, err := svc.SendWakeWebhook(cfg, wolTestMAC); err == nil {
		t.Fatal("self-signed certificate accepted by default for wake")
	}
	started := time.Now()
	assertWOLStatus(t, svc.checkDeviceStatus(context.Background(), cfg, device), device.ID, "unknown", started)
	cfg.TLSSkipVerify = true
	if response, err := svc.SendWakeWebhook(cfg, wolTestMAC); err != nil || response == nil || !response.Success {
		t.Fatalf("wake with TLS skip: response = %+v, err = %v", response, err)
	}
	started = time.Now()
	assertWOLStatus(t, svc.checkDeviceStatus(context.Background(), cfg, device), device.ID, "online", started)
	// Switching the shared flag off must restore verification on the same service.
	cfg.TLSSkipVerify = false
	if _, err := svc.SendWakeWebhook(cfg, wolTestMAC); err == nil {
		t.Error("wake retained insecure TLS after disabling skip")
	}
	started = time.Now()
	assertWOLStatus(t, svc.checkDeviceStatus(context.Background(), cfg, device), device.ID, "unknown", started)
}

func TestWOLConfigURLValidation(t *testing.T) {
	newWOLTestDB(t)
	svc := NewWOLService()
	valid := "http://127.0.0.1:12345/wake?mac={mac}"
	invalid := []struct{ name, value string }{
		{"empty", ""},
		{"CRLF", valid + "\r\nX-Test: injected"},
		{"multiple URLs space", valid + " http://127.0.0.1/status?mac={mac}"},
		{"multiple URLs newline", valid + "\nhttp://127.0.0.1/status?mac={mac}"},
		{"non HTTP", "ftp://127.0.0.1/wake?mac={mac}"},
		{"missing scheme", "127.0.0.1/wake?mac={mac}"},
		{"missing placeholder", "http://127.0.0.1/wake"},
		{"host placeholder", "http://{mac}/wake"},
		{"host and path placeholder", "http://{mac}.localhost/wake/{mac}"},
		{"userinfo", "http://user:pass@127.0.0.1/wake/{mac}"},
		{"fragment", "http://127.0.0.1/wake#{mac}"},
	}
	for _, tc := range invalid {
		for _, field := range []string{"wake", "status"} {
			t.Run(field+"/"+tc.name, func(t *testing.T) {
				wake, status := valid, valid
				if field == "wake" {
					wake = tc.value
				} else {
					status = tc.value
				}
				if _, err := svc.SaveConfig(wake, status, false); !errors.Is(err, ErrInvalidWOLConfig) {
					t.Fatalf("SaveConfig error = %v, want ErrInvalidWOLConfig", err)
				}
				var count int64
				if err := db.DB.Model(&model.WOLConfig{}).Count(&count).Error; err != nil || count != 0 {
					t.Fatalf("invalid config persisted: count = %d, err = %v", count, err)
				}
			})
		}
	}
	for _, scheme := range []string{"http", "https"} {
		if _, err := svc.SaveConfig(scheme+"://127.0.0.1/wake/{mac}", scheme+"://127.0.0.1/status?mac={mac}", false); err != nil {
			t.Errorf("valid %s URL rejected: %v", scheme, err)
		}
	}
}

func TestWOLConfigAndDeviceCRUD(t *testing.T) {
	database := newWOLTestDB(t)
	svc := NewWOLService()
	if _, err := svc.GetConfig(); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("initial GetConfig error = %v", err)
	}
	wake, status := "http://127.0.0.1/wake/{mac}", "https://127.0.0.1/status?mac={mac}"
	cfg, err := svc.SaveConfig(wake, status, true)
	if err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}
	loaded, err := svc.GetConfig()
	if err != nil || loaded.ID != cfg.ID || loaded.WakeURL != wake || loaded.StatusURL != status || !loaded.TLSSkipVerify || !loaded.Enabled {
		t.Fatalf("saved config = %+v, err = %v", loaded, err)
	}
	updatedCfg, err := svc.SaveConfig(status, wake, false)
	if err != nil || updatedCfg.ID != cfg.ID {
		t.Fatalf("update config = %+v, err = %v", updatedCfg, err)
	}
	loaded, err = svc.GetConfig()
	if err != nil || loaded.WakeURL != status || loaded.StatusURL != wake || loaded.TLSSkipVerify {
		t.Fatalf("updated config not persisted: %+v, err = %v", loaded, err)
	}
	var count int64
	if err := database.Model(&model.WOLConfig{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("config count = %d, err = %v", count, err)
	}
	dev1, err := svc.CreateDevice(" PVE 主机 ", " "+wolTestMAC+" ")
	if err != nil {
		t.Fatalf("CreateDevice: %v", err)
	}
	dev2, err := svc.CreateDevice("台式机", "11:22:33:44:55:66")
	if err != nil {
		t.Fatalf("CreateDevice: %v", err)
	}
	if dev1.ID == 0 || dev1.Name != "PVE 主机" || dev1.MAC != wolTestMAC {
		t.Fatalf("created device = %+v", dev1)
	}
	list, err := svc.ListDevices()
	if err != nil || len(list) != 2 || list[0].ID != dev1.ID || list[1].ID != dev2.ID {
		t.Fatalf("ListDevices = %+v, err = %v", list, err)
	}
	updated, err := svc.UpdateDevice(dev1.ID, "PVE 主宿主机", "11:22:33:44:55:77")
	if err != nil || updated.Name != "PVE 主宿主机" || updated.MAC != "11:22:33:44:55:77" {
		t.Fatalf("UpdateDevice = %+v, err = %v", updated, err)
	}
	loadedDevice, err := svc.GetDevice(dev1.ID)
	if err != nil || loadedDevice.Name != updated.Name || loadedDevice.MAC != updated.MAC {
		t.Fatalf("GetDevice = %+v, err = %v", loadedDevice, err)
	}
	if err := svc.DeleteDevice(dev2.ID); err != nil {
		t.Fatalf("DeleteDevice: %v", err)
	}
	if _, err := svc.GetDevice(dev2.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("deleted device error = %v", err)
	}
	list, err = svc.ListDevices()
	if err != nil || len(list) != 1 || list[0].ID != dev1.ID {
		t.Fatalf("remaining devices = %+v, err = %v", list, err)
	}
	if err := svc.DeleteConfig(); err != nil {
		t.Fatalf("DeleteConfig: %v", err)
	}
	if _, err := svc.GetConfig(); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("deleted config error = %v", err)
	}
	if _, err := svc.GetDevice(dev1.ID); err != nil {
		t.Fatalf("deleting config removed device: %v", err)
	}
}

func TestWOLListDeviceStatusesIsolation(t *testing.T) {
	newWOLTestDB(t)
	svc := NewWOLService()
	if _, err := svc.ListDeviceStatuses(context.Background()); err == nil {
		t.Error("expected missing configuration error")
	}
	var mu sync.Mutex
	seen := make(map[string]int)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mac := r.URL.Query().Get("mac")
		mu.Lock()
		seen[mac]++
		mu.Unlock()
		if r.Method != http.MethodGet {
			t.Errorf("method = %s", r.Method)
		}
		switch mac {
		case "00:11:22:33:44:01", "00:11:22:33:44:05":
			_, _ = w.Write([]byte(`{"success":true,"online":true}`))
		case "00:11:22:33:44:02", "00:11:22:33:44:06":
			_, _ = w.Write([]byte(`{"success":true,"online":false}`))
		case "00:11:22:33:44:03":
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"success":true,"online":true}`))
		default:
			_, _ = w.Write([]byte(`{"success":true,"online":"false"}`))
		}
	}))
	defer server.Close()
	if _, err := svc.SaveConfig(server.URL+"/wake/{mac}", server.URL+"/status?mac={mac}", false); err != nil {
		t.Fatalf("SaveConfig: %v", err)
	}
	if results, err := svc.ListDeviceStatuses(context.Background()); err != nil || len(results) != 0 {
		t.Fatalf("empty device list = %+v, err = %v", results, err)
	}
	var devices []*model.WOLDevice
	for i := 1; i <= 6; i++ {
		device, err := svc.CreateDevice(fmt.Sprintf("device %d", i), fmt.Sprintf("00:11:22:33:44:%02d", i))
		if err != nil {
			t.Fatalf("CreateDevice: %v", err)
		}
		devices = append(devices, device)
	}
	started := time.Now()
	results, err := svc.ListDeviceStatuses(context.Background())
	if err != nil || len(results) != len(devices) {
		t.Fatalf("ListDeviceStatuses = %+v, err = %v", results, err)
	}
	want := []string{"online", "offline", "unknown", "unknown", "online", "offline"}
	mu.Lock()
	defer mu.Unlock()
	for i, result := range results {
		assertWOLStatus(t, result, devices[i].ID, want[i], started)
		if seen[devices[i].MAC] != 1 {
			t.Errorf("device %d checked %d times", devices[i].ID, seen[devices[i].MAC])
		}
	}
}

func TestUpgradeLegacyWOLDatabases(t *testing.T) {
	cases := []struct {
		name   string
		schema string
		insert string
	}{
		{
			name: "raw packet schema",
			schema: `CREATE TABLE wol_configs (
				id integer PRIMARY KEY AUTOINCREMENT,
				host text, port integer, use_tls numeric DEFAULT 0,
				tls_skip_verify numeric DEFAULT 0, packet_template text,
				enabled numeric DEFAULT 1, created_at datetime, updated_at datetime
			)`,
			insert: `INSERT INTO wol_configs (host, port, use_tls, tls_skip_verify, packet_template)
				VALUES ('127.0.0.1', 12345, 1, 1, ?)`,
		},
		{
			name: "v010 webhook_url NOT NULL",
			schema: `CREATE TABLE wol_configs (
				id integer PRIMARY KEY AUTOINCREMENT,
				webhook_url text NOT NULL, enabled numeric DEFAULT 1,
				insecure_skip_verify numeric DEFAULT 0,
				created_at datetime, updated_at datetime
			)`,
			insert: `INSERT INTO wol_configs (webhook_url) VALUES (?)`,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			previous := db.DB
			t.Cleanup(func() { db.DB = previous })
			path := filepath.Join(t.TempDir(), "legacy.db")
			legacy, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
			if err != nil {
				t.Fatalf("open synthetic legacy database: %v", err)
			}
			closeWOLTestDB(t, legacy)
			for _, statement := range []string{
				tc.schema,
				`CREATE TABLE wol_devices (id integer PRIMARY KEY AUTOINCREMENT, name varchar(100) NOT NULL, mac varchar(50) NOT NULL, created_at datetime, updated_at datetime)`,
				`INSERT INTO wol_devices (id, name, mac) VALUES (7, 'legacy device', 'aa:bb:cc:dd:ee:ff')`,
			} {
				if err := legacy.Exec(statement).Error; err != nil {
					t.Fatalf("create synthetic legacy schema: %v", err)
				}
			}
			oldValue := "GET /wake?mac={mac} HTTP/1.1\r\nHost: 127.0.0.1:12345\r\n\r\n"
			if tc.name != "raw packet schema" {
				oldValue = "http://127.0.0.1:12345/legacy?mac={mac}"
			}
			if err := legacy.Exec(tc.insert, oldValue).Error; err != nil {
				t.Fatalf("insert legacy config: %v", err)
			}
			upgraded, err := db.InitDB(path)
			if err != nil {
				t.Fatalf("InitDB migration: %v", err)
			}
			closeWOLTestDB(t, upgraded)
			svc := NewWOLService()
			cfg, err := svc.GetConfig()
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				t.Fatalf("GetConfig after migration: %v", err)
			}
			if cfg != nil && (cfg.WakeURL != "" || cfg.StatusURL != "") {
				t.Errorf("legacy config automatically interpreted as webhook URLs: %+v", cfg)
			}
			assertDevice := func() {
				t.Helper()
				devices, err := svc.ListDevices()
				if err != nil || len(devices) != 1 || devices[0].ID != 7 || devices[0].Name != "legacy device" || devices[0].MAC != wolTestMAC {
					t.Fatalf("legacy devices not preserved: %+v, err = %v", devices, err)
				}
			}
			assertDevice()
			wake, status := "http://127.0.0.1:12345/wake/{mac}", "https://127.0.0.1:12345/status?mac={mac}"
			if _, err := svc.SaveConfig(wake, status, true); err != nil {
				t.Fatalf("SaveConfig after migration: %v", err)
			}
			loaded, err := svc.GetConfig()
			if err != nil || loaded.WakeURL != wake || loaded.StatusURL != status || !loaded.TLSSkipVerify {
				t.Fatalf("migrated config = %+v, err = %v", loaded, err)
			}
			// A leftover NOT NULL legacy column can allow UPDATE but break a fresh INSERT.
			if err := svc.DeleteConfig(); err != nil {
				t.Fatalf("DeleteConfig after migration: %v", err)
			}
			if _, err := svc.SaveConfig(wake, status, false); err != nil {
				t.Fatalf("SaveConfig fresh insert after migration: %v", err)
			}
			assertDevice()
		})
	}
}
