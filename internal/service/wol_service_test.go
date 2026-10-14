package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTriggerWakeURL(t *testing.T) {
	// 1. Success case
	tsSuccess := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("expected GET method, got %s", r.Method)
		}
		if r.URL.Query().Get("mac") != "11:22:33:44:55:66" {
			t.Errorf("expected mac parameter in query, got %s", r.URL.Query().Get("mac"))
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Wake-on-LAN magic packet broadcasted successfully",
			"mac":     "11:22:33:44:55:66",
		})
	}))
	defer tsSuccess.Close()

	svc := NewWOLService()
	res, err := svc.TriggerWakeURL(tsSuccess.URL+"?mac=11:22:33:44:55:66", false)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if !res.Success || res.MAC != "11:22:33:44:55:66" {
		t.Errorf("unexpected response: %+v", res)
	}

	// 2. Failure case from remote server (success: false)
	tsFail := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("expected GET method, got %s", r.Method)
		}
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "invalid or missing authentication token",
		})
	}))
	defer tsFail.Close()

	_, err = svc.TriggerWakeURL(tsFail.URL+"?mac=11:22:33:44:55:66", false)
	if err == nil {
		t.Fatalf("expected error for unauthorized token, got nil")
	}
	if err.Error() != "WOL 唤醒失败: invalid or missing authentication token" {
		t.Errorf("expected specific error message, got %v", err)
	}
}
