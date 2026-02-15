package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestLoadRegistrySuccess(t *testing.T) {
	r, err := LoadRegistry("testdata/registry_good")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Tools) != 2 {
		t.Errorf("got %d tools, want 2", len(r.Tools))
	}
	if _, ok := r.Tools["add"]; !ok {
		t.Error("missing tool 'add'")
	}
	if _, ok := r.Tools["echo"]; !ok {
		t.Error("missing tool 'echo'")
	}
}

func TestLoadRegistryEmpty(t *testing.T) {
	r, err := LoadRegistry("testdata/registry_empty")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.Tools) != 0 {
		t.Errorf("got %d tools, want 0", len(r.Tools))
	}
}

func TestLoadRegistryDuplicateName(t *testing.T) {
	_, err := LoadRegistry("testdata/registry_dup")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "duplicate tool name") {
		t.Errorf("error = %q, want containing 'duplicate tool name'", err.Error())
	}
}

func TestLoadRegistryInvalidClaim(t *testing.T) {
	_, err := LoadRegistry("testdata/registry_bad_claim")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "unknown claim") {
		t.Errorf("error = %q, want containing 'unknown claim'", err.Error())
	}
}

func TestLoadRegistryBadDir(t *testing.T) {
	_, err := LoadRegistry("testdata/nonexistent")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "reading tools directory") {
		t.Errorf("error = %q, want containing 'reading tools directory'", err.Error())
	}
}

func TestRegistryExecute(t *testing.T) {
	r, err := LoadRegistry("testdata/registry_good")
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	result, err := r.Execute("add", json.RawMessage(`{"a":10,"b":20}`))
	if err != nil {
		t.Fatalf("execute error: %v", err)
	}
	if result != "30" {
		t.Errorf("result = %q, want %q", result, "30")
	}
}

func TestRegistryExecuteUnknown(t *testing.T) {
	r, err := LoadRegistry("testdata/registry_good")
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	_, err = r.Execute("nonexistent", json.RawMessage(`{}`))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "unknown tool") {
		t.Errorf("error = %q, want containing 'unknown tool'", err.Error())
	}
}

func TestOpenAISchemas(t *testing.T) {
	r, err := LoadRegistry("testdata/registry_good")
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	schemas := r.OpenAISchemas()
	if len(schemas) != 2 {
		t.Errorf("got %d schemas, want 2", len(schemas))
	}
	for _, s := range schemas {
		if s.Type != "function" {
			t.Errorf("type = %q, want %q", s.Type, "function")
		}
		if s.Function.Name == "" {
			t.Error("function name is empty")
		}
		if !json.Valid(s.Function.Parameters) {
			t.Errorf("parameters for %q is not valid JSON", s.Function.Name)
		}
	}
}
