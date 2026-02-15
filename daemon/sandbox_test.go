package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func probeGlobals(t *testing.T, globals []string) map[string]string {
	t.Helper()
	globalsJSON, _ := json.Marshal(globals)
	result, err := ExecuteLua("testdata/sandbox_probe.lua", nil,
		json.RawMessage(`{"globals":`+string(globalsJSON)+`}`))
	if err != nil {
		t.Fatalf("probe failed: %v", err)
	}

	types := make(map[string]string)
	for _, entry := range strings.Split(result, ",") {
		parts := strings.SplitN(entry, "=", 2)
		if len(parts) == 2 {
			types[parts[0]] = parts[1]
		}
	}
	return types
}

func TestSandboxDangerousGlobalsRemoved(t *testing.T) {
	globals := []string{"dofile", "loadfile", "print"}
	types := probeGlobals(t, globals)

	for _, name := range globals {
		if types[name] != "nil" {
			t.Errorf("%s = %q, want nil (removed for sandbox safety)", name, types[name])
		}
	}
}

func TestSandboxDangerousLibsAbsent(t *testing.T) {
	globals := []string{"os", "io", "debug", "package", "require"}
	types := probeGlobals(t, globals)

	for _, name := range globals {
		if types[name] != "nil" {
			t.Errorf("%s = %q, want nil (library should not be loaded)", name, types[name])
		}
	}
}

func TestSandboxSafeGlobalsPresent(t *testing.T) {
	globals := []string{
		"pairs", "ipairs", "next", "type", "tostring", "tonumber",
		"pcall", "xpcall", "error", "assert", "select",
		"rawget", "rawset", "rawequal", "rawlen",
		"getmetatable", "setmetatable",
	}
	types := probeGlobals(t, globals)

	for _, name := range globals {
		if types[name] == "nil" {
			t.Errorf("%s is nil, want function (safe base global)", name)
		}
	}
}

func TestSandboxSafeLibsPresent(t *testing.T) {
	globals := []string{"math", "string", "table"}
	types := probeGlobals(t, globals)

	for _, name := range globals {
		if types[name] != "table" {
			t.Errorf("%s = %q, want table (safe library)", name, types[name])
		}
	}

	// Spot-check specific functions
	funcs := []string{"math.floor", "string.format", "table.insert"}
	funcTypes := probeGlobals(t, funcs)
	for _, name := range funcs {
		if funcTypes[name] != "function" {
			t.Errorf("%s = %q, want function", name, funcTypes[name])
		}
	}
}

func TestSandboxAlwaysOnPresent(t *testing.T) {
	globals := []string{"time.now", "time.unix", "json.encode", "json.decode"}
	types := probeGlobals(t, globals)

	for _, name := range globals {
		if types[name] != "function" {
			t.Errorf("%s = %q, want function (always-on capability)", name, types[name])
		}
	}
}

func TestSandboxClaimedNotLeaked(t *testing.T) {
	// Without any claims, http and fs should not exist
	result, err := ExecuteLua("testdata/cap_check.lua", nil, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "http=nil") {
		t.Errorf("http should be nil without claims, got %q", result)
	}
	if !strings.Contains(result, "fs=nil") {
		t.Errorf("fs should be nil without claims, got %q", result)
	}
}
