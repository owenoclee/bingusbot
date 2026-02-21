package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// --- Always-on: time ---

func TestAlwaysOnTimeNow(t *testing.T) {
	result, err := ExecuteLua("testdata/good_time.lua", nil, json.RawMessage(`{"mode":"now"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should match "YYYY-MM-DD HH:MM:SS UTC"
	matched, _ := regexp.MatchString(`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$`, result)
	if !matched {
		t.Errorf("result = %q, want UTC timestamp format", result)
	}
}

func TestAlwaysOnTimeUnix(t *testing.T) {
	result, err := ExecuteLua("testdata/good_time.lua", nil, json.RawMessage(`{"mode":"unix"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	ts, err := strconv.ParseFloat(result, 64)
	if err != nil {
		t.Fatalf("result %q is not a number: %v", result, err)
	}
	now := float64(time.Now().Unix())
	if ts < now-5 || ts > now+5 {
		t.Errorf("timestamp %v is not within 5s of now (%v)", ts, now)
	}
}

// --- Always-on: json ---

func TestAlwaysOnJSONEncode(t *testing.T) {
	result, err := ExecuteLua("testdata/good_json.lua", nil, json.RawMessage(`{"mode":"encode"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !json.Valid([]byte(result)) {
		t.Errorf("result %q is not valid JSON", result)
	}
	var m map[string]interface{}
	json.Unmarshal([]byte(result), &m)
	if m["key"] != "value" {
		t.Errorf("key = %v, want 'value'", m["key"])
	}
}

func TestAlwaysOnJSONDecode(t *testing.T) {
	result, err := ExecuteLua("testdata/good_json.lua", nil,
		json.RawMessage(`{"mode":"decode","data":"{\"key\":\"hello\"}"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "hello" {
		t.Errorf("result = %q, want %q", result, "hello")
	}
}

// --- http.get ---

func TestHTTPGetInjected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "pong")
	}))
	defer srv.Close()

	result, err := ExecuteLua("testdata/good_claims_http.lua", []string{"http.get"},
		json.RawMessage(fmt.Sprintf(`{"url":"%s"}`, srv.URL)))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "200:pong" {
		t.Errorf("result = %q, want %q", result, "200:pong")
	}
}

func TestHTTPGetWithoutClaim(t *testing.T) {
	// Without the http.get claim, http should be nil and the tool should fail
	_, err := ExecuteLua("testdata/good_claims_http.lua", nil,
		json.RawMessage(`{"url":"http://localhost"}`))
	if err == nil {
		t.Fatal("expected error when http.get not claimed")
	}
}

// --- http.post ---

func TestHTTPPostInjected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("method = %q, want POST", r.Method)
		}
		fmt.Fprint(w, "received")
	}))
	defer srv.Close()

	// Create an inline tool that uses http.post
	tmpDir := t.TempDir()
	toolPath := tmpDir + "/post_tool.lua"
	os.WriteFile(toolPath, []byte(`
tool = {
    name = "post_tool",
    description = "POST test",
    parameters = [[{"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}]],
    claims = {"http.post"}
}
function execute(args)
    local resp = http.post(args.url, "hello", "text/plain")
    return tostring(resp.status) .. ":" .. resp.body
end
`), 0644)

	result, err := ExecuteLua(toolPath, []string{"http.post"},
		json.RawMessage(fmt.Sprintf(`{"url":"%s"}`, srv.URL)))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "200:received" {
		t.Errorf("result = %q, want %q", result, "200:received")
	}
}

func TestHTTPPartialClaim(t *testing.T) {
	// Claim http.get only — http.post should not be available
	tmpDir := t.TempDir()
	toolPath := tmpDir + "/partial.lua"
	os.WriteFile(toolPath, []byte(`
tool = {
    name = "partial",
    description = "Check partial claims",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {"http.get"}
}
function execute(args)
    local results = {}
    results[#results + 1] = "get=" .. type(http.get)
    results[#results + 1] = "post=" .. type(http.post)
    return table.concat(results, ",")
end
`), 0644)

	result, err := ExecuteLua(toolPath, []string{"http.get"}, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "get=function") {
		t.Errorf("http.get should be function, got %q", result)
	}
	if !strings.Contains(result, "post=nil") {
		t.Errorf("http.post should be nil without claim, got %q", result)
	}
}

// --- fs ---

func TestFsReadInjected(t *testing.T) {
	result, err := ExecuteLua("testdata/good_claims_fs.lua", []string{"fs.read", "fs.list"},
		json.RawMessage(`{"path":"testdata/good_echo.lua"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "echo") {
		t.Errorf("result should contain file contents, got %q", result)
	}
}

func TestFsWriteInjected(t *testing.T) {
	tmpDir := t.TempDir()
	toolPath := tmpDir + "/write_tool.lua"
	os.WriteFile(toolPath, []byte(`
tool = {
    name = "write_tool",
    description = "Write test",
    parameters = [[{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}]],
    claims = {"fs.write"}
}
function execute(args)
    local ok, err = fs.write(args.path, args.content)
    if ok then return "ok" end
    return "error:" .. tostring(err)
end
`), 0644)

	outPath := tmpDir + "/output.txt"
	result, err := ExecuteLua(toolPath, []string{"fs.write"},
		json.RawMessage(fmt.Sprintf(`{"path":"%s","content":"hello from lua"}`, outPath)))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "ok" {
		t.Errorf("result = %q, want %q", result, "ok")
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("failed to read written file: %v", err)
	}
	if string(data) != "hello from lua" {
		t.Errorf("file contents = %q, want %q", string(data), "hello from lua")
	}
}

func TestFsListInjected(t *testing.T) {
	tmpDir := t.TempDir()
	toolPath := tmpDir + "/list_tool.lua"
	os.WriteFile(toolPath, []byte(`
tool = {
    name = "list_tool",
    description = "List test",
    parameters = [[{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}]],
    claims = {"fs.list"}
}
function execute(args)
    local entries = fs.list(args.path)
    if not entries then return "nil" end
    local names = {}
    for i, entry in ipairs(entries) do
        names[#names + 1] = entry.name
    end
    return table.concat(names, ",")
end
`), 0644)

	// Create some files in a temp dir to list
	listDir := t.TempDir()
	os.WriteFile(listDir+"/a.txt", []byte("a"), 0644)
	os.WriteFile(listDir+"/b.txt", []byte("b"), 0644)

	result, err := ExecuteLua(toolPath, []string{"fs.list"},
		json.RawMessage(fmt.Sprintf(`{"path":"%s"}`, listDir)))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "a.txt") || !strings.Contains(result, "b.txt") {
		t.Errorf("result = %q, want containing a.txt and b.txt", result)
	}
}

func TestIsValidClaim(t *testing.T) {
	valid := []string{"http.get", "http.post", "fs.read", "fs.write", "fs.list",
		"log.append:events", "log.query:events", "log.append:todos", "log.query:my-log"}
	for _, c := range valid {
		if !IsValidClaim(c) {
			t.Errorf("IsValidClaim(%q) = false, want true", c)
		}
	}

	invalid := []string{"", "bogus", "http.delete", "fs.execute", "os.time", "json",
		"log:events",            // old format, no longer valid
		"log.append:",           // empty namespace
		"log.append:UPPER",      // uppercase not allowed
		"log.append:../escape",  // path traversal
		"log.append:has space",  // spaces not allowed
		"bogus:events",          // unknown prefix
	}
	for _, c := range invalid {
		if IsValidClaim(c) {
			t.Errorf("IsValidClaim(%q) = true, want false", c)
		}
	}
}

func TestLogAppendClaimInjected(t *testing.T) {
	tmpDir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", origHome)

	toolPath := tmpDir + "/log_tool.lua"
	os.WriteFile(toolPath, []byte(`
tool = {
    name = "log_tool",
    description = "Log test",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {"log.append:test-ns"}
}
function execute(args)
    local result = test_ns.append({msg = "hello"})
    return result
end
`), 0644)

	// Note: claim uses "test-ns" but Lua namespace becomes "test_ns"
	// Actually no — the namespace IS "test-ns" and Lua uses test-ns which isn't
	// a valid identifier. Let me use "testns" instead.

	os.WriteFile(toolPath, []byte(`
tool = {
    name = "log_tool",
    description = "Log test",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {"log.append:testns"}
}
function execute(args)
    local result = testns.append({msg = "hello"})
    return result
end
`), 0644)

	result, err := ExecuteLua(toolPath, []string{"log.append:testns"}, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "Logged to testns" {
		t.Errorf("result = %q, want %q", result, "Logged to testns")
	}
}

func TestLogQueryClaimInjected(t *testing.T) {
	tmpDir := t.TempDir()
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", origHome)

	// First append via Go directly
	appendFn := makeLogAppend("testns")
	appendFn(map[string]any{"content": "test entry"})

	toolPath := tmpDir + "/query_tool.lua"
	os.WriteFile(toolPath, []byte(`
tool = {
    name = "query_tool",
    description = "Query test",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {"log.query:testns"}
}
function execute(args)
    return testns.query("24h", "")
end
`), 0644)

	result, err := ExecuteLua(toolPath, []string{"log.query:testns"}, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "test entry") {
		t.Errorf("result should contain 'test entry', got %q", result)
	}
}

func TestLogClaimIsolation(t *testing.T) {
	// A tool with log.append:foo should NOT have access to foo.query
	tmpDir := t.TempDir()
	toolPath := tmpDir + "/isolated.lua"
	os.WriteFile(toolPath, []byte(`
tool = {
    name = "isolated",
    description = "Check isolation",
    parameters = [[{"type":"object","properties":{}}]],
    claims = {"log.append:myns"}
}
function execute(args)
    local append_type = type(myns.append)
    local query_type = type(myns.query)
    return "append=" .. append_type .. ",query=" .. query_type
end
`), 0644)

	result, err := ExecuteLua(toolPath, []string{"log.append:myns"}, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "append=function") {
		t.Errorf("myns.append should be function, got %q", result)
	}
	if !strings.Contains(result, "query=nil") {
		t.Errorf("myns.query should be nil without log.query claim, got %q", result)
	}
}

func TestCapabilityWithoutClaim(t *testing.T) {
	result, err := ExecuteLua("testdata/cap_check.lua", nil, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "http=nil") {
		t.Errorf("http should be nil without claim, got %q", result)
	}
	if !strings.Contains(result, "fs=nil") {
		t.Errorf("fs should be nil without claim, got %q", result)
	}
}
