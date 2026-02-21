package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// --- ExtractToolMeta tests ---

func TestExtractToolMetaSuccess(t *testing.T) {
	tool, err := ExtractToolMeta("testdata/good_add.lua")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if tool.Name != "add" {
		t.Errorf("name = %q, want %q", tool.Name, "add")
	}
	if tool.Description != "Add two numbers" {
		t.Errorf("description = %q, want %q", tool.Description, "Add two numbers")
	}
	if !json.Valid([]byte(tool.Parameters)) {
		t.Error("parameters is not valid JSON")
	}
	if len(tool.Claims) != 0 {
		t.Errorf("claims = %v, want empty", tool.Claims)
	}
	if tool.Path != "testdata/good_add.lua" {
		t.Errorf("path = %q, want %q", tool.Path, "testdata/good_add.lua")
	}
}

func TestExtractToolMetaWithClaims(t *testing.T) {
	tool, err := ExtractToolMeta("testdata/good_claims_http.lua")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tool.Claims) != 1 || tool.Claims[0] != "http.get" {
		t.Errorf("claims = %v, want [http.get]", tool.Claims)
	}
}

func TestExtractToolMetaBadFiles(t *testing.T) {
	tests := []struct {
		name    string
		file    string
		wantErr string
	}{
		{"no tool table", "testdata/bad_no_tool.lua", "no 'tool' table"},
		{"no name", "testdata/bad_no_name.lua", "tool.name is required"},
		{"no description", "testdata/bad_no_desc.lua", "tool.description is required"},
		{"no parameters", "testdata/bad_no_params.lua", "tool.parameters is required"},
		{"invalid JSON", "testdata/bad_invalid_json.lua", "not valid JSON"},
		{"syntax error", "testdata/bad_syntax.lua", "executing lua file"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ExtractToolMeta(tt.file)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("error = %q, want containing %q", err.Error(), tt.wantErr)
			}
		})
	}
}

// --- ExecuteLua tests ---

func TestExecuteLuaAdd(t *testing.T) {
	result, err := ExecuteLua("testdata/good_add.lua", nil, json.RawMessage(`{"a":2,"b":3}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "5" {
		t.Errorf("result = %q, want %q", result, "5")
	}
}

func TestExecuteLuaStringArgs(t *testing.T) {
	result, err := ExecuteLua("testdata/good_echo.lua", nil, json.RawMessage(`{"message":"hello world"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "hello world" {
		t.Errorf("result = %q, want %q", result, "hello world")
	}
}

func TestExecuteLuaNestedArgs(t *testing.T) {
	result, err := ExecuteLua("testdata/good_nested_args.lua", nil,
		json.RawMessage(`{"user":{"name":"Alice","age":30},"tags":["a","b"]}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "Alice:30:2" {
		t.Errorf("result = %q, want %q", result, "Alice:30:2")
	}
}

func TestExecuteLuaArrayArgs(t *testing.T) {
	result, err := ExecuteLua("testdata/good_concat.lua", nil,
		json.RawMessage(`{"items":["x","y","z"]}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "x,y,z" {
		t.Errorf("result = %q, want %q", result, "x,y,z")
	}
}

func TestExecuteLuaNoExecute(t *testing.T) {
	_, err := ExecuteLua("testdata/bad_no_execute.lua", nil, json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "execute") {
		t.Errorf("error = %q, want containing 'execute'", err.Error())
	}
}

func TestExecuteLuaReturnsNumber(t *testing.T) {
	// Lua auto-coerces numbers to strings, so this succeeds
	result, err := ExecuteLua("testdata/bad_returns_number.lua", nil, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != "42" {
		t.Errorf("result = %q, want %q", result, "42")
	}
}

func TestExecuteLuaInvalidArgsJSON(t *testing.T) {
	_, err := ExecuteLua("testdata/good_add.lua", nil, json.RawMessage(`not-json`))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "parsing arguments") {
		t.Errorf("error = %q, want containing 'parsing arguments'", err.Error())
	}
}

func TestExecuteLuaBuiltinError(t *testing.T) {
	// A builtin that returns (nil, error) should propagate the error through execute()
	claims := []string{}
	// Inject a test builtin that always errors
	_, err := ExecuteLua("testdata/good_builtin_error.lua", claims, json.RawMessage(`{}`))
	if err == nil {
		// The failme() function doesn't exist, so Lua will error
		t.Fatal("expected error, got nil")
	}
	// Should get an error about calling nil (failme doesn't exist)
	if !strings.Contains(err.Error(), "execute() failed") {
		t.Errorf("error = %q, want containing 'execute() failed'", err.Error())
	}
}

func TestExecuteLuaRuntimeError(t *testing.T) {
	// good_add.lua with missing args will cause a nil arithmetic error in Lua
	_, err := ExecuteLua("testdata/good_add.lua", nil, json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "execute() failed") {
		t.Errorf("error = %q, want containing 'execute() failed'", err.Error())
	}
}
