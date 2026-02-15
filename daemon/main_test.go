package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func setupTestRegistry(t *testing.T) {
	t.Helper()
	var err error
	registry, err = LoadRegistry("testdata/registry_good")
	if err != nil {
		t.Fatalf("failed to load test registry: %v", err)
	}
}

func TestHandleHealth(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want %q", ct, "application/json")
	}

	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body)
	if body["status"] != "ok" {
		t.Errorf("status = %q, want %q", body["status"], "ok")
	}
}

func TestHandleTools(t *testing.T) {
	setupTestRegistry(t)

	req := httptest.NewRequest("GET", "/tools", nil)
	w := httptest.NewRecorder()
	handleTools(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var schemas []OpenAIToolSchema
	if err := json.NewDecoder(w.Body).Decode(&schemas); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if len(schemas) != 2 {
		t.Errorf("got %d schemas, want 2", len(schemas))
	}
}

func TestHandleCallSuccess(t *testing.T) {
	setupTestRegistry(t)

	body := strings.NewReader(`{"name":"add","arguments":{"a":2,"b":3}}`)
	req := httptest.NewRequest("POST", "/call", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleCall(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp CallResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Result != "5" {
		t.Errorf("result = %q, want %q", resp.Result, "5")
	}
	if resp.Error != "" {
		t.Errorf("unexpected error: %q", resp.Error)
	}
}

func TestHandleCallUnknownTool(t *testing.T) {
	setupTestRegistry(t)

	body := strings.NewReader(`{"name":"nonexistent","arguments":{}}`)
	req := httptest.NewRequest("POST", "/call", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleCall(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want %d", w.Code, http.StatusInternalServerError)
	}

	var resp CallResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if !strings.Contains(resp.Error, "unknown tool") {
		t.Errorf("error = %q, want containing 'unknown tool'", resp.Error)
	}
}

func TestHandleCallBadMethod(t *testing.T) {
	req := httptest.NewRequest("GET", "/call", nil)
	w := httptest.NewRecorder()
	handleCall(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want %d", w.Code, http.StatusMethodNotAllowed)
	}
}

func TestHandleCallBadBody(t *testing.T) {
	body := strings.NewReader(`not json`)
	req := httptest.NewRequest("POST", "/call", body)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleCall(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}

	var resp CallResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Error == "" {
		t.Error("expected error message in response")
	}
}
