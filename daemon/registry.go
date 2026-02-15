package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ToolDef struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Parameters  string   `json:"parameters"` // raw JSON Schema string
	Claims      []string `json:"claims"`
	Path        string   `json:"-"` // filesystem path to .lua file
}

type Registry struct {
	Tools map[string]*ToolDef
}

func LoadRegistry(dir string) (*Registry, error) {
	r := &Registry{Tools: make(map[string]*ToolDef)}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("reading tools directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".lua") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		tool, err := ExtractToolMeta(path)
		if err != nil {
			return nil, fmt.Errorf("loading %s: %w", entry.Name(), err)
		}

		// Validate claims
		for _, claim := range tool.Claims {
			if !IsValidClaim(claim) {
				return nil, fmt.Errorf("tool %q has unknown claim %q", tool.Name, claim)
			}
		}

		if _, exists := r.Tools[tool.Name]; exists {
			return nil, fmt.Errorf("duplicate tool name %q", tool.Name)
		}
		r.Tools[tool.Name] = tool
	}

	return r, nil
}

func (r *Registry) Execute(name string, argsJSON json.RawMessage) (string, error) {
	tool, ok := r.Tools[name]
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", name)
	}
	return ExecuteLua(tool.Path, tool.Claims, argsJSON)
}

type OpenAIToolSchema struct {
	Type     string              `json:"type"`
	Function OpenAIFunctionSchema `json:"function"`
}

type OpenAIFunctionSchema struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters"`
}

func (r *Registry) OpenAISchemas() []OpenAIToolSchema {
	schemas := make([]OpenAIToolSchema, 0, len(r.Tools))
	for _, tool := range r.Tools {
		schemas = append(schemas, OpenAIToolSchema{
			Type: "function",
			Function: OpenAIFunctionSchema{
				Name:        tool.Name,
				Description: tool.Description,
				Parameters:  json.RawMessage(tool.Parameters),
			},
		})
	}
	return schemas
}
