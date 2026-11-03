package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/evalexp/home-nas-panel/internal/config"
	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
	"github.com/evalexp/home-nas-panel/internal/service"
	"github.com/gin-gonic/gin"
)

func setupNavRouter(t *testing.T) (*gin.Engine, string) {
	t.Helper()
	previousDB := db.DB
	database, err := db.InitDB(filepath.Join(t.TempDir(), "nav.db"))
	if err != nil {
		t.Fatalf("initialize database: %v", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatalf("get SQL database: %v", err)
	}
	t.Cleanup(func() {
		db.DB = previousDB
		if err := sqlDB.Close(); err != nil {
			t.Errorf("close test database: %v", err)
		}
	})

	cfg := &config.Config{JWTSecret: "nav-tests-secret"}
	authSvc := service.NewAuthService(cfg)
	token, err := authSvc.GenerateToken(1, "admin")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	return SetupRouter(cfg, authSvc, nil, nil, service.NewNavService(), nil), token
}

func navRequest(t *testing.T, router http.Handler, token, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var data []byte
	if body != nil {
		var err error
		data, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(data))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	return response
}

func decodeNavResponse[T any](t *testing.T, response *httptest.ResponseRecorder, status int) T {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status = %d, want %d; body = %s", response.Code, status, response.Body.String())
	}
	var value T
	if err := json.Unmarshal(response.Body.Bytes(), &value); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return value
}

func TestNavReadEndpoints(t *testing.T) {
	router, token := setupNavRouter(t)
	const image = "data:image/png;base64,aWNvbg=="
	icon := decodeNavResponse[model.NavIcon](t,
		navRequest(t, router, token, http.MethodPost, "/api/nav/icons", map[string]string{"name": "Shared icon", "data": image}), http.StatusOK)
	if icon.Data != image || icon.Name != "Shared icon" {
		t.Fatalf("uploaded icon = %+v", icon)
	}

	items := []model.NavItem{
		{Title: "First", URL: "https://first.example", IconID: &icon.ID, Category: "A", Description: "first", OrderIndex: 2},
		{Title: "Second", URL: "https://second.example", IconID: &icon.ID, Category: "B", OrderIndex: 1},
		{Title: "Preset", URL: "https://preset.example", Icon: "Server", Category: "A", OrderIndex: 1},
	}
	for i := range items {
		items[i] = decodeNavResponse[model.NavItem](t,
			navRequest(t, router, token, http.MethodPost, "/api/nav", items[i]), http.StatusOK)
	}

	response := navRequest(t, router, token, http.MethodGet, "/api/nav", nil)
	list := decodeNavResponse[[]map[string]json.RawMessage](t, response, http.StatusOK)
	if len(list) != 3 || strings.Contains(response.Body.String(), image) {
		t.Fatalf("unexpected nav list: %s", response.Body.String())
	}
	expectedIDs := []uint{items[1].ID, items[2].ID, items[0].ID}
	for i, entry := range list {
		if _, exists := entry["customIcon"]; exists {
			t.Errorf("nav entry contains customIcon: %s", response.Body.String())
		}
		if _, exists := entry["data"]; exists {
			t.Error("nav entry contains image data")
		}
		var item model.NavItem
		encoded, _ := json.Marshal(entry)
		if err := json.Unmarshal(encoded, &item); err != nil {
			t.Fatal(err)
		}
		if item.ID != expectedIDs[i] {
			t.Errorf("item %d ID = %d, want %d (order_index, then id)", i, item.ID, expectedIDs[i])
		}
		if item.CreatedAt.IsZero() || item.UpdatedAt.IsZero() {
			t.Error("navigation timestamps missing")
		}
		if item.ID == items[2].ID {
			if item.Icon != "Server" || string(entry["iconId"]) != "null" {
				t.Errorf("preset icon fields lost: %s", encoded)
			}
		} else if item.IconID == nil || *item.IconID != icon.ID {
			t.Errorf("shared icon reference lost: %s", encoded)
		}
		if item.ID == items[0].ID && (item.Title != "First" || item.URL != "https://first.example" || item.Description != "first" || item.Category != "A" || item.OrderIndex != 2) {
			t.Errorf("navigation fields lost: %s", encoded)
		}
	}

	metadataResponse := navRequest(t, router, token, http.MethodGet, "/api/nav/icons", nil)
	metadata := decodeNavResponse[[]map[string]json.RawMessage](t, metadataResponse, http.StatusOK)
	if len(metadata) != 1 {
		t.Fatalf("unexpected metadata: %s", metadataResponse.Body.String())
	}
	for _, key := range []string{"id", "name", "createdAt", "updatedAt"} {
		if _, exists := metadata[0][key]; !exists {
			t.Errorf("metadata missing %q", key)
		}
	}
	if len(metadata[0]) != 4 || strings.Contains(metadataResponse.Body.String(), image) {
		t.Errorf("metadata exposes extra fields: %s", metadataResponse.Body.String())
	}

	loaded := decodeNavResponse[model.NavIcon](t,
		navRequest(t, router, token, http.MethodGet, fmt.Sprintf("/api/nav/icons/%d", icon.ID), nil), http.StatusOK)
	if loaded.ID != icon.ID || loaded.Data != image || loaded.Name != icon.Name || !loaded.CreatedAt.Equal(icon.CreatedAt) || !loaded.UpdatedAt.Equal(icon.UpdatedAt) {
		t.Errorf("loaded icon = %+v, want %+v", loaded, icon)
	}

	// The service must leave image associations unloaded as well as omit them from JSON.
	serviceItems, err := service.NewNavService().ListItems()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range serviceItems {
		if item.CustomIcon != nil {
			t.Error("ListItems preloaded an icon")
		}
	}

	// Explicitly clearing an icon and optional fields must still persist zero values.
	updated := items[0]
	updated.IconID = nil
	updated.Icon = "Globe"
	updated.Category = ""
	updated.Description = ""
	decodeNavResponse[model.NavItem](t,
		navRequest(t, router, token, http.MethodPut, fmt.Sprintf("/api/nav/%d", updated.ID), updated), http.StatusOK)
	var stored model.NavItem
	if err := db.DB.First(&stored, updated.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.IconID != nil || stored.Icon != "Globe" || stored.Category != "" || stored.Description != "" {
		t.Errorf("update did not clear fields: %+v", stored)
	}

	decodeNavResponse[map[string]string](t,
		navRequest(t, router, token, http.MethodDelete, fmt.Sprintf("/api/nav/icons/%d", icon.ID), nil), http.StatusOK)
	afterDelete := decodeNavResponse[[]model.NavItem](t,
		navRequest(t, router, token, http.MethodGet, "/api/nav", nil), http.StatusOK)
	for _, item := range afterDelete {
		if item.IconID != nil {
			t.Errorf("deleted icon remains linked to item %d", item.ID)
		}
	}
	decodeNavResponse[map[string]string](t,
		navRequest(t, router, token, http.MethodGet, fmt.Sprintf("/api/nav/icons/%d", icon.ID), nil), http.StatusNotFound)
}

func TestNavReadAuthenticationAndErrors(t *testing.T) {
	router, token := setupNavRouter(t)
	for _, path := range []string{"/api/nav", "/api/nav/icons", "/api/nav/icons/1"} {
		for _, credential := range []string{"", "invalid-token"} {
			response := navRequest(t, router, credential, http.MethodGet, path, nil)
			if response.Code != http.StatusUnauthorized {
				t.Errorf("GET %s with credential %q = %d, want 401", path, credential, response.Code)
			}
		}
	}
	for _, id := range []string{"0", "invalid", "-1", "4294967296"} {
		response := navRequest(t, router, token, http.MethodGet, "/api/nav/icons/"+id, nil)
		if response.Code != http.StatusBadRequest {
			t.Errorf("icon ID %q = %d, want 400", id, response.Code)
		}
	}
	decodeNavResponse[map[string]string](t,
		navRequest(t, router, token, http.MethodGet, "/api/nav/icons/99", nil), http.StatusNotFound)

	// Simulate a storage failure to distinguish it from a missing icon.
	if err := db.DB.Migrator().DropTable(&model.NavIcon{}); err != nil {
		t.Fatal(err)
	}
	decodeNavResponse[map[string]string](t,
		navRequest(t, router, token, http.MethodGet, "/api/nav/icons/1", nil), http.StatusInternalServerError)
}

func TestNavEmptyLists(t *testing.T) {
	router, token := setupNavRouter(t)
	for _, path := range []string{"/api/nav", "/api/nav/icons"} {
		response := navRequest(t, router, token, http.MethodGet, path, nil)
		if response.Code != http.StatusOK || response.Body.String() != "[]" {
			t.Errorf("GET %s = %d %s, want 200 []", path, response.Code, response.Body.String())
		}
	}
}
