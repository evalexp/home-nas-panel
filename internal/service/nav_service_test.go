package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/evalexp/home-nas-panel/internal/db"
	"github.com/evalexp/home-nas-panel/internal/model"
)

func TestFetchIconFromURL(t *testing.T) {
	// 1. Mock server that returns a valid 1x1 transparent PNG
	png1x1 := []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
		0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/icon.png":
			w.Header().Set("Content-Type", "image/png")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(png1x1)
		case "/logo.svg":
			w.Header().Set("Content-Type", "image/svg+xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"></svg>`))
		case "/not-found":
			w.WriteHeader(http.StatusNotFound)
		case "/index.html":
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<!DOCTYPE html><html><body>Webpage</body></html>`))
		default:
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
	defer ts.Close()

	svc := NewNavService()

	// Test 1: Fetch valid PNG
	res, err := svc.FetchIconFromURL(ts.URL + "/icon.png")
	if err != nil {
		t.Fatalf("FetchIconFromURL failed for PNG: %v", err)
	}
	if !strings.HasPrefix(res.Data, "data:image/png;base64,") {
		t.Errorf("expected data to have prefix data:image/png;base64,, got %s", res.Data[:30])
	}
	if res.Filename != "icon" {
		t.Errorf("expected filename 'icon', got %s", res.Filename)
	}

	// Test 2: Fetch valid SVG
	resSVG, err := svc.FetchIconFromURL(ts.URL + "/logo.svg")
	if err != nil {
		t.Fatalf("FetchIconFromURL failed for SVG: %v", err)
	}
	if !strings.HasPrefix(resSVG.Data, "data:image/svg+xml;base64,") {
		t.Errorf("expected data to have prefix data:image/svg+xml;base64,, got %s", resSVG.Data[:30])
	}
	if resSVG.Filename != "logo" {
		t.Errorf("expected filename 'logo', got %s", resSVG.Filename)
	}

	// Test 3: HTTP 404
	_, err = svc.FetchIconFromURL(ts.URL + "/not-found")
	if err == nil {
		t.Fatalf("expected error for 404, got nil")
	}

	// Test 4: HTML response rejected
	_, err = svc.FetchIconFromURL(ts.URL + "/index.html")
	if err == nil {
		t.Fatalf("expected error for HTML page, got nil")
	}

	// Test 5: Invalid scheme
	_, err = svc.FetchIconFromURL("ftp://example.com/icon.png")
	if err == nil {
		t.Fatalf("expected error for ftp scheme, got nil")
	}
}

func TestReorderItems(t *testing.T) {
	tmpDB := t.TempDir() + "/test.db"
	_, err := db.InitDB(tmpDB)
	if err != nil {
		t.Fatalf("failed to init db: %v", err)
	}

	svc := NewNavService()

	item1 := model.NavItem{Title: "Item 1", URL: "http://1", Category: "A", OrderIndex: 1}
	item2 := model.NavItem{Title: "Item 2", URL: "http://2", Category: "A", OrderIndex: 2}
	item3 := model.NavItem{Title: "Item 3", URL: "http://3", Category: "B", OrderIndex: 1}

	if err := svc.CreateItem(&item1); err != nil {
		t.Fatalf("create item1 failed: %v", err)
	}
	if err := svc.CreateItem(&item2); err != nil {
		t.Fatalf("create item2 failed: %v", err)
	}
	if err := svc.CreateItem(&item3); err != nil {
		t.Fatalf("create item3 failed: %v", err)
	}

	// Move item 1 from Category A to Category B, placed after item 3
	reqs := []ReorderItemReq{
		{ID: item1.ID, Category: "B", OrderIndex: 2},
		{ID: item2.ID, Category: "A", OrderIndex: 1},
		{ID: item3.ID, Category: "B", OrderIndex: 1},
	}

	if err := svc.ReorderItems(reqs); err != nil {
		t.Fatalf("ReorderItems failed: %v", err)
	}

	items, err := svc.ListItems()
	if err != nil {
		t.Fatalf("ListItems failed: %v", err)
	}

	for _, it := range items {
		if it.ID == item1.ID {
			if it.Category != "B" || it.OrderIndex != 2 {
				t.Errorf("item1 expected Cat B, order 2, got %s, %d", it.Category, it.OrderIndex)
			}
		}
		if it.ID == item2.ID {
			if it.Category != "A" || it.OrderIndex != 1 {
				t.Errorf("item2 expected Cat A, order 1, got %s, %d", it.Category, it.OrderIndex)
			}
		}
		if it.ID == item3.ID {
			if it.Category != "B" || it.OrderIndex != 1 {
				t.Errorf("item3 expected Cat B, order 1, got %s, %d", it.Category, it.OrderIndex)
			}
		}
	}
}
