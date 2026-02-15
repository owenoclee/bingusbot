package main

import (
	"encoding/json"
	"sort"
	"strings"
	"testing"
)

func TestSandboxAllowlistComplete(t *testing.T) {
	result, err := ExecuteLua("testdata/enumerate_globals.lua", nil, json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("enumeration failed: %v", err)
	}

	got := make(map[string]bool)
	for _, line := range strings.Split(result, "\n") {
		if line != "" {
			got[line] = true
		}
	}

	// The complete set of allowed globals and their nested keys.
	// If this test fails, a new global appeared (security review needed)
	// or one was removed (update the list).
	allowed := map[string]bool{
		// Base globals (safe subset after denylist)
		// Note: _ENV is the environment itself, not enumerable as a key within it
		"_G=table":             true,
		"_VERSION=string":      true,
		"assert=function":      true,
		"collectgarbage=function": true,
		"error=function":       true,
		"getmetatable=function": true,
		"ipairs=function":      true,
		"load=function":        true,
		"next=function":        true,
		"pairs=function":       true,
		"pcall=function":       true,
		"rawequal=function":    true,
		"rawget=function":      true,
		"rawlen=function":      true,
		"rawset=function":      true,
		"select=function":      true,
		"setmetatable=function": true,
		"tonumber=function":    true,
		"tostring=function":    true,
		"type=function":        true,
		"xpcall=function":      true,

		// math library
		"math=table":           true,
		"math.abs=function":    true,
		"math.acos=function":   true,
		"math.asin=function":   true,
		"math.atan=function":   true,
		"math.atan2=function":  true,
		"math.ceil=function":   true,
		"math.cos=function":    true,
		"math.cosh=function":   true,
		"math.deg=function":    true,
		"math.exp=function":    true,
		"math.floor=function":  true,
		"math.fmod=function":   true,
		"math.frexp=function":  true,
		"math.huge=number":     true,
		"math.ldexp=function":  true,
		"math.log=function":    true,
		"math.max=function":    true,
		"math.min=function":    true,
		"math.modf=function":   true,
		"math.pi=number":       true,
		"math.pow=function":    true,
		"math.rad=function":    true,
		"math.random=function": true,
		"math.randomseed=function": true,
		"math.sin=function":    true,
		"math.sinh=function":   true,
		"math.sqrt=function":   true,
		"math.tan=function":    true,
		"math.tanh=function":   true,

		// string library
		"string=table":          true,
		"string.byte=function":  true,
		"string.char=function":  true,
		"string.find=function":  true,
		"string.format=function": true,
		"string.len=function":   true,
		"string.lower=function": true,
		"string.rep=function":   true,
		"string.reverse=function": true,
		"string.sub=function":   true,
		"string.upper=function": true,

		// table library
		"table=table":            true,
		"table.concat=function":  true,
		"table.insert=function":  true,
		"table.pack=function":    true,
		"table.remove=function":  true,
		"table.sort=function":    true,
		"table.unpack=function":  true,

		// Always-on: time
		"time=table":        true,
		"time.now=function":  true,
		"time.unix=function": true,

		// Always-on: json
		"json=table":           true,
		"json.encode=function": true,
		"json.decode=function": true,
	}

	// Check for unexpected globals (security risk)
	var unexpected []string
	for entry := range got {
		if !allowed[entry] {
			unexpected = append(unexpected, entry)
		}
	}
	sort.Strings(unexpected)
	for _, entry := range unexpected {
		t.Errorf("UNEXPECTED in sandbox: %s", entry)
	}

	// Check for missing expected globals (functional regression)
	var missing []string
	for entry := range allowed {
		if !got[entry] {
			missing = append(missing, entry)
		}
	}
	sort.Strings(missing)
	for _, entry := range missing {
		t.Errorf("MISSING from sandbox: %s", entry)
	}
}
