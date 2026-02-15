package main

import (
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// --- time ---

func TestTimeNowFormat(t *testing.T) {
	result, err := timeNow()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	_, parseErr := time.Parse("2006-01-02 15:04:05 UTC", result)
	if parseErr != nil {
		t.Errorf("result %q does not match expected format: %v", result, parseErr)
	}
}

func TestTimeUnixRange(t *testing.T) {
	result, err := timeUnix()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	now := float64(time.Now().Unix())
	if math.Abs(result-now) > 2 {
		t.Errorf("result %v not within 2s of now (%v)", result, now)
	}
}

// --- http ---

func TestHTTPGet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "hello")
	}))
	defer srv.Close()

	result, err := httpGet(srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["status"] != float64(200) {
		t.Errorf("status = %v, want 200", result["status"])
	}
	if result["body"] != "hello" {
		t.Errorf("body = %q, want %q", result["body"], "hello")
	}
}

func TestHTTPGetBadURL(t *testing.T) {
	result, err := httpGet("http://127.0.0.1:1")
	if err != nil {
		t.Fatalf("unexpected error (should return status 0): %v", err)
	}
	if result["status"] != float64(0) {
		t.Errorf("status = %v, want 0 for connection error", result["status"])
	}
}

func TestHTTPPost(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("method = %q, want POST", r.Method)
		}
		if r.Header.Get("Content-Type") != "text/plain" {
			t.Errorf("content-type = %q, want text/plain", r.Header.Get("Content-Type"))
		}
		fmt.Fprint(w, "ok")
	}))
	defer srv.Close()

	result, err := httpPost(srv.URL, "payload", "text/plain")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["status"] != float64(200) {
		t.Errorf("status = %v, want 200", result["status"])
	}
	if result["body"] != "ok" {
		t.Errorf("body = %q, want %q", result["body"], "ok")
	}
}

func TestHTTPPostDefaultContentType(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("content-type = %q, want application/json", r.Header.Get("Content-Type"))
		}
		w.WriteHeader(200)
	}))
	defer srv.Close()

	_, err := httpPost(srv.URL, "{}", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

// --- fs ---

func TestFsReadWrite(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/test.txt"

	ok, err := fsWrite(path, "hello world")
	if err != nil {
		t.Fatalf("write error: %v", err)
	}
	if !ok {
		t.Error("write returned false")
	}

	content, err := fsRead(path)
	if err != nil {
		t.Fatalf("read error: %v", err)
	}
	if content != "hello world" {
		t.Errorf("content = %q, want %q", content, "hello world")
	}
}

func TestFsReadNotFound(t *testing.T) {
	_, err := fsRead("/nonexistent/path/file.txt")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func TestFsList(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(dir+"/a.txt", []byte("a"), 0644)
	os.Mkdir(dir+"/subdir", 0755)

	entries, err := fsList(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("got %d entries, want 2", len(entries))
	}

	found := map[string]bool{}
	for _, e := range entries {
		m := e.(map[string]any)
		found[m["name"].(string)] = m["is_dir"].(bool)
	}
	if isDir, ok := found["a.txt"]; !ok || isDir {
		t.Error("expected a.txt as non-dir")
	}
	if isDir, ok := found["subdir"]; !ok || !isDir {
		t.Error("expected subdir as dir")
	}
}

func TestFsListNotFound(t *testing.T) {
	_, err := fsList("/nonexistent/path")
	if err == nil {
		t.Fatal("expected error for nonexistent directory")
	}
}

// --- json ---

func TestJSONEncodeDecode(t *testing.T) {
	input := map[string]any{"key": "value", "num": float64(42)}
	encoded, err := jsonEncode(input)
	if err != nil {
		t.Fatalf("encode error: %v", err)
	}

	decoded, err := jsonDecode(encoded)
	if err != nil {
		t.Fatalf("decode error: %v", err)
	}

	m := decoded.(map[string]any)
	if m["key"] != "value" {
		t.Errorf("key = %v, want %q", m["key"], "value")
	}
	if m["num"] != float64(42) {
		t.Errorf("num = %v, want 42", m["num"])
	}
}

func TestJSONDecodeInvalid(t *testing.T) {
	_, err := jsonDecode("not json")
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}
