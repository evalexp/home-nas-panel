package api

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
)

func TestNavInternalURLLifecycle(t *testing.T) {
	router, token := setupNavRouter(t)
	icon := decodeNavResponse[model.NavIcon](t,
		navRequest(t, router, token, http.MethodPost, "/api/nav/icons", map[string]string{
			"name": "NAS", "data": "data:image/png;base64,aWNvbg==",
		}), http.StatusOK)
	item := decodeNavResponse[model.NavItem](t,
		navRequest(t, router, token, http.MethodPost, "/api/nav", model.NavItem{
			Title: "NAS", URL: "https://nas.example", InternalURL: " \thttp://192.168.1.2:5000/ \n",
			IconID: &icon.ID, Category: "管理", Description: "Storage", OrderIndex: 2,
		}), http.StatusOK)
	if item.InternalURL != "http://192.168.1.2:5000/" {
		t.Fatalf("created internal URL = %q", item.InternalURL)
	}
	other := decodeNavResponse[model.NavItem](t,
		navRequest(t, router, token, http.MethodPost, "/api/nav", map[string]any{
			"title": "Other", "url": "https://other.example", "icon": "Globe", "orderIndex": 1,
		}), http.StatusOK)
	list := decodeNavResponse[[]model.NavItem](t,
		navRequest(t, router, token, http.MethodGet, "/api/nav", nil), http.StatusOK)
	if len(list) != 2 || list[0].ID != other.ID || list[1].ID != item.ID || list[1].InternalURL != item.InternalURL {
		t.Fatalf("created items or ordering lost: %+v", list)
	}

	for _, input := range []string{" \thttp://nas.lan:8080/path \n", "", " \t\r\n"} {
		want := ""
		if input == " \thttp://nas.lan:8080/path \n" {
			want = "http://nas.lan:8080/path"
		}
		// Seed a nonempty value before each clear to detect skipped zero-value updates.
		if err := db.DB.Model(&model.NavItem{}).Where("id = ?", item.ID).Update("internal_url", "http://old.lan").Error; err != nil {
			t.Fatal(err)
		}
		item.InternalURL = input
		updated := decodeNavResponse[model.NavItem](t,
			navRequest(t, router, token, http.MethodPut, fmt.Sprintf("/api/nav/%d", item.ID), item), http.StatusOK)
		if updated.InternalURL != want {
			t.Errorf("update %q returned internal URL %q, want %q", input, updated.InternalURL, want)
		}
		var stored model.NavItem
		if err := db.DB.First(&stored, item.ID).Error; err != nil {
			t.Fatal(err)
		}
		if stored.InternalURL != want || stored.URL != item.URL || stored.IconID == nil || *stored.IconID != icon.ID || stored.OrderIndex != 2 || stored.Category != item.Category || stored.Description != item.Description {
			t.Fatalf("update %q lost fields: %+v", input, stored)
		}
		list = decodeNavResponse[[]model.NavItem](t,
			navRequest(t, router, token, http.MethodGet, "/api/nav", nil), http.StatusOK)
		if len(list) != 2 || list[0].ID != other.ID || list[1].ID != item.ID || list[1].InternalURL != want || list[1].URL != item.URL || list[1].IconID == nil || *list[1].IconID != icon.ID {
			t.Fatalf("update %q lost list fields or ordering: %+v", input, list)
		}
	}
}

func TestNavInternalURLLegacyClient(t *testing.T) {
	router, token := setupNavRouter(t)
	for _, whitespace := range []bool{false, true} {
		body := map[string]any{"title": "Legacy", "url": "https://legacy.example", "icon": "Server"}
		if whitespace {
			body["internalUrl"] = " \t\r\n"
		}
		item := decodeNavResponse[model.NavItem](t,
			navRequest(t, router, token, http.MethodPost, "/api/nav", body), http.StatusOK)
		if item.InternalURL != "" || item.URL != body["url"] || item.Icon != "Server" {
			t.Fatalf("legacy/blank create = %+v", item)
		}
		delete(body, "internalUrl")
		body["title"] = "Edited legacy"
		decodeNavResponse[model.NavItem](t,
			navRequest(t, router, token, http.MethodPut, fmt.Sprintf("/api/nav/%d", item.ID), body), http.StatusOK)
		var stored model.NavItem
		if err := db.DB.First(&stored, item.ID).Error; err != nil {
			t.Fatal(err)
		}
		if stored.Title != "Edited legacy" || stored.InternalURL != "" || stored.URL != item.URL || stored.Icon != item.Icon || stored.OrderIndex != item.OrderIndex {
			t.Fatalf("legacy update lost fields: %+v", stored)
		}
	}
	list := decodeNavResponse[[]map[string]any](t,
		navRequest(t, router, token, http.MethodGet, "/api/nav", nil), http.StatusOK)
	if len(list) != 2 {
		t.Fatalf("legacy list length = %d, want 2", len(list))
	}
	for _, entry := range list {
		if value, exists := entry["internalUrl"]; !exists || value != "" {
			t.Errorf("legacy list internalUrl = %v, present = %v", value, exists)
		}
	}
}

func TestNavLegacyNetworkMigration(t *testing.T) {
	router, token := setupNavRouter(t)
	icon := model.NavIcon{Name: "Legacy", Data: "data:image/png;base64,aWNvbg=="}
	if err := db.DB.Create(&icon).Error; err != nil {
		t.Fatal(err)
	}
	legacy := model.NavItem{Title: "Old card", URL: "https://old.example", IconID: &icon.ID,
		Icon: "Server", Category: "管理", Description: "Existing data", OrderIndex: 7}
	if err := db.DB.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}
	// Only the temporary database from setupNavRouter is modified.
	if err := db.DB.Exec("ALTER TABLE nav_items DROP COLUMN internal_url").Error; err != nil {
		t.Fatal(err)
	}
	if db.DB.Migrator().HasColumn(&model.NavItem{}, "internal_url") {
		t.Fatal("legacy schema still contains internal_url")
	}
	if err := db.DB.AutoMigrate(&model.NavItem{}); err != nil {
		t.Fatal(err)
	}
	var stored model.NavItem
	if err := db.DB.First(&stored, legacy.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.InternalURL != "" || stored.Title != legacy.Title || stored.URL != legacy.URL || stored.Icon != legacy.Icon || stored.IconID == nil || *stored.IconID != icon.ID || stored.Category != legacy.Category || stored.Description != legacy.Description || stored.OrderIndex != legacy.OrderIndex || !stored.CreatedAt.Equal(legacy.CreatedAt) || !stored.UpdatedAt.Equal(legacy.UpdatedAt) {
		t.Fatalf("migration lost legacy data: %+v", stored)
	}
	list := decodeNavResponse[[]map[string]any](t,
		navRequest(t, router, token, http.MethodGet, "/api/nav", nil), http.StatusOK)
	if len(list) != 1 || list[0]["internalUrl"] != "" || list[0]["url"] != legacy.URL {
		t.Fatalf("migrated legacy list = %+v", list)
	}
}
