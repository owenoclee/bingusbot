package main

import (
	"encoding/json"
	"fmt"

	lua "github.com/Shopify/go-lua"
)

// ExtractToolMeta loads a Lua file in a minimal VM to read the tool table.
func ExtractToolMeta(path string) (*ToolDef, error) {
	l := lua.NewState()
	// Open only base libs for table construction
	lua.OpenLibraries(l)

	if err := lua.DoFile(l, path); err != nil {
		return nil, fmt.Errorf("executing lua file: %w", err)
	}

	l.Global("tool")
	if !l.IsTable(-1) {
		return nil, fmt.Errorf("no 'tool' table found")
	}

	name := getStringField(l, "name")
	desc := getStringField(l, "description")
	params := getStringField(l, "parameters")

	if name == "" {
		return nil, fmt.Errorf("tool.name is required")
	}
	if desc == "" {
		return nil, fmt.Errorf("tool.description is required")
	}
	if params == "" {
		return nil, fmt.Errorf("tool.parameters is required")
	}

	// Validate parameters is valid JSON
	if !json.Valid([]byte(params)) {
		return nil, fmt.Errorf("tool.parameters is not valid JSON")
	}

	claims := getStringArrayField(l, "claims")

	return &ToolDef{
		Name:        name,
		Description: desc,
		Parameters:  params,
		Claims:      claims,
		Path:        path,
	}, nil
}

// newSandboxedState creates a Lua VM with dangerous globals removed and
// capabilities injected according to the provided claims.
func newSandboxedState(toolClaims []string) *lua.State {
	l := lua.NewState()

	// Load all standard libraries, then remove dangerous ones.
	// This is a denylist approach — safer than calling individual openers
	// which don't properly register globals. The sandbox tests verify
	// the denylist is complete.
	lua.OpenLibraries(l)

	for _, name := range []string{
		"os", "io", "debug", "package", "bit32",   // dangerous libraries
		"dofile", "loadfile", "print", "require",   // dangerous base globals
	} {
		l.PushNil()
		l.SetGlobal(name)
	}

	// Always-on capabilities (no claim needed)
	InjectAlwaysOn(l)

	// Inject claimed capabilities
	for _, claim := range toolClaims {
		InjectClaim(l, claim)
	}

	return l
}

// ExecuteLua runs a tool's execute(args) function in a fresh, sandboxed VM.
// Only capabilities matching the tool's claims are injected.
func ExecuteLua(path string, toolClaims []string, argsJSON json.RawMessage) (string, error) {
	l := newSandboxedState(toolClaims)

	// Load and execute the tool file
	if err := lua.DoFile(l, path); err != nil {
		return "", fmt.Errorf("loading tool: %w", err)
	}

	// Parse args JSON into a Lua table
	var args map[string]interface{}
	if err := json.Unmarshal(argsJSON, &args); err != nil {
		return "", fmt.Errorf("parsing arguments: %w", err)
	}

	// Push execute function
	l.Global("execute")
	if !l.IsFunction(-1) {
		return "", fmt.Errorf("no 'execute' function found")
	}

	// Push args table
	pushValue(l, args)

	// Call execute(args) — request up to 2 return values (result, err)
	if err := l.ProtectedCall(1, 2, 0); err != nil {
		return "", fmt.Errorf("execute() failed: %w", err)
	}

	// Check for Lua-level error (second return value)
	if errMsg, ok := l.ToString(-1); ok && errMsg != "" {
		// If first return is nil, this is an error from a builtin
		if l.IsNil(-2) {
			return "", fmt.Errorf("%s", errMsg)
		}
	}
	l.Pop(1) // pop the second return value

	// Get result (first return value)
	result, ok := l.ToString(-1)
	if !ok {
		return "", fmt.Errorf("execute() must return a string")
	}

	return result, nil
}

// pushValue pushes an arbitrary Go value onto the Lua stack.
func pushValue(l *lua.State, v interface{}) {
	switch val := v.(type) {
	case map[string]interface{}:
		l.NewTable()
		for k, v := range val {
			l.PushString(k)
			pushValue(l, v)
			l.SetTable(-3)
		}
	case []interface{}:
		l.NewTable()
		for i, v := range val {
			l.PushInteger(i + 1)
			pushValue(l, v)
			l.SetTable(-3)
		}
	case string:
		l.PushString(val)
	case float64:
		l.PushNumber(val)
	case bool:
		l.PushBoolean(val)
	case nil:
		l.PushNil()
	default:
		l.PushString(fmt.Sprintf("%v", val))
	}
}

// getStringField reads a string field from the table at the top of the stack.
func getStringField(l *lua.State, key string) string {
	l.Field(-1, key)
	s, _ := l.ToString(-1)
	l.Pop(1)
	return s
}

// getStringArrayField reads a string array field from the table at the top of the stack.
func getStringArrayField(l *lua.State, key string) []string {
	l.Field(-1, key)
	defer l.Pop(1)

	if !l.IsTable(-1) {
		return nil
	}

	var result []string
	length := l.RawLength(-1)
	for i := 1; i <= length; i++ {
		l.RawGetInt(-1, i)
		if s, ok := l.ToString(-1); ok {
			result = append(result, s)
		}
		l.Pop(1)
	}
	return result
}

// luaToGo converts a Lua value at the given index to a Go value.
func luaToGo(l *lua.State, index int) any {
	switch l.TypeOf(index) {
	case lua.TypeString:
		s, _ := l.ToString(index)
		return s
	case lua.TypeNumber:
		n, _ := l.ToNumber(index)
		return n
	case lua.TypeBoolean:
		return l.ToBoolean(index)
	case lua.TypeTable:
		return luaTableToGo(l, index)
	default:
		return nil
	}
}

// luaTableToGo converts a Lua table to either a Go map or slice.
func luaTableToGo(l *lua.State, index int) any {
	if index < 0 {
		index = l.Top() + 1 + index
	}

	length := l.RawLength(index)
	if length > 0 {
		arr := make([]any, length)
		for i := 1; i <= length; i++ {
			l.RawGetInt(index, i)
			arr[i-1] = luaToGo(l, -1)
			l.Pop(1)
		}
		return arr
	}

	m := make(map[string]any)
	l.PushNil()
	for l.Next(index) {
		key := fmt.Sprintf("%v", luaToGo(l, -2))
		m[key] = luaToGo(l, -1)
		l.Pop(1)
	}
	return m
}
