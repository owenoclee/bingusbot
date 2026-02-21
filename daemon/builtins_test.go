package main

import (
	"encoding/json"
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

// --- log ---

func TestLogAppendAndQuery(t *testing.T) {
	dir := t.TempDir()
	// Override logDir by writing directly, then querying
	namespace := "test-ns"
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", dir)
	defer os.Setenv("HOME", origHome)

	append := makeLogAppend(namespace)
	query := makeLogQuery(namespace)

	// Append an entry
	result, err := append(map[string]any{"type": "meal", "content": "pizza"})
	if err != nil {
		t.Fatalf("append error: %v", err)
	}
	if result != "Logged to test-ns" {
		t.Errorf("result = %q, want %q", result, "Logged to test-ns")
	}

	// Append another
	_, err = append(map[string]any{"type": "exercise", "content": "ran 5km", "tags": []any{"outdoor"}})
	if err != nil {
		t.Fatalf("append error: %v", err)
	}

	// Query all
	raw, err := query("24h", "")
	if err != nil {
		t.Fatalf("query error: %v", err)
	}
	var entries []map[string]any
	if err := json.Unmarshal([]byte(raw), &entries); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("got %d entries, want 2", len(entries))
	}

	// Check auto-injected fields
	if _, ok := entries[0]["id"]; !ok {
		t.Error("entry missing auto-injected 'id'")
	}
	if _, ok := entries[0]["createdAt"]; !ok {
		t.Error("entry missing auto-injected 'createdAt'")
	}
}

func TestLogQueryTextSearch(t *testing.T) {
	dir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", dir)
	defer os.Setenv("HOME", origHome)

	append := makeLogAppend("search-test")
	query := makeLogQuery("search-test")

	append(map[string]any{"content": "Had sushi for lunch"})
	append(map[string]any{"content": "Pizza for dinner"})
	append(map[string]any{"content": "Went for a walk", "tags": []any{"outdoor"}})

	tests := []struct {
		text  string
		count int
	}{
		{"sushi", 1},
		{"PIZZA", 1},     // case-insensitive
		{"outdoor", 1},   // matches tags
		{"for", 3},       // matches all
		{"nonexistent", 0},
		{"", 3},          // no filter
	}

	for _, tt := range tests {
		raw, err := query("24h", tt.text)
		if err != nil {
			t.Fatalf("query(%q) error: %v", tt.text, err)
		}
		var entries []map[string]any
		json.Unmarshal([]byte(raw), &entries)
		if len(entries) != tt.count {
			t.Errorf("query(text=%q): got %d entries, want %d", tt.text, len(entries), tt.count)
		}
	}
}

func TestLogAppendBadInput(t *testing.T) {
	dir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", dir)
	defer os.Setenv("HOME", origHome)

	append := makeLogAppend("bad-input")
	_, err := append("not a table")
	if err == nil {
		t.Fatal("expected error for non-table input")
	}
}

func TestLogQueryEmpty(t *testing.T) {
	dir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", dir)
	defer os.Setenv("HOME", origHome)

	query := makeLogQuery("empty")
	raw, err := query("24h", "")
	if err != nil {
		t.Fatalf("query error: %v", err)
	}
	if raw != "null" {
		t.Errorf("result = %q, want %q", raw, "null")
	}
}

func TestParseSince(t *testing.T) {
	now := time.Now().UTC()

	tests := []struct {
		input    string
		wantDiff time.Duration
		wantErr  bool
	}{
		{"24h", 24 * time.Hour, false},
		{"7d", 7 * 24 * time.Hour, false},
		{"1h", 1 * time.Hour, false},
		{"", 24 * time.Hour, false}, // default
		{"bogus", 0, true},
	}

	for _, tt := range tests {
		result, err := parseSince(tt.input)
		if tt.wantErr {
			if err == nil {
				t.Errorf("parseSince(%q): expected error", tt.input)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseSince(%q): unexpected error: %v", tt.input, err)
			continue
		}
		diff := now.Sub(result)
		if diff < tt.wantDiff-2*time.Second || diff > tt.wantDiff+2*time.Second {
			t.Errorf("parseSince(%q): diff=%v, want ~%v", tt.input, diff, tt.wantDiff)
		}
	}

	// ISO timestamp
	ts := "2026-01-15T10:00:00Z"
	result, err := parseSince(ts)
	if err != nil {
		t.Fatalf("parseSince(%q): unexpected error: %v", ts, err)
	}
	expected, _ := time.Parse(time.RFC3339, ts)
	if !result.Equal(expected) {
		t.Errorf("parseSince(%q) = %v, want %v", ts, result, expected)
	}
}

func TestEntryMatchesText(t *testing.T) {
	entry := map[string]any{
		"type":    "meal",
		"content": "Had Sushi for lunch",
		"tags":    []any{"Japanese", "restaurant"},
	}

	tests := []struct {
		text string
		want bool
	}{
		{"sushi", true},    // case-insensitive content
		{"meal", true},     // matches type (caller lowercases)
		{"japanese", true}, // matches tag
		{"dinner", false},
	}

	for _, tt := range tests {
		got := entryMatchesText(entry, tt.text)
		if got != tt.want {
			t.Errorf("entryMatchesText(text=%q) = %v, want %v", tt.text, got, tt.want)
		}
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
