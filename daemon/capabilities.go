package main

import (
	"reflect"
	"strings"

	lua "github.com/Shopify/go-lua"
)

// LuaFunc is a function that can be injected into a Lua VM.
type LuaFunc struct {
	Namespace string
	Name      string
	Func      lua.Function
}

// alwaysOn capabilities are injected into every tool VM regardless of claims.
var alwaysOn = []LuaFunc{
	{"time", "now", wrap(timeNow)},
	{"time", "unix", wrap(timeUnix)},
	{"json", "encode", wrap(jsonEncode)},
	{"json", "decode", wrap(jsonDecode)},
}

// claims maps claim names to the functions they grant.
var claims = map[string][]LuaFunc{
	"http.get":  {{"http", "get", wrap(httpGet)}},
	"http.post": {{"http", "post", wrap(httpPost)}},
	"fs.read":   {{"fs", "read", wrap(fsRead)}},
	"fs.write":  {{"fs", "write", wrap(fsWrite)}},
	"fs.list":   {{"fs", "list", wrap(fsList)}},
}

// parameterizedClaims maps claim prefixes to factory functions that produce
// namespace-scoped capabilities. Claim format: "prefix:param".
// Example: "log:events" → events.append() and events.query() scoped to
// ~/.bingus/logs/events/.
var parameterizedClaims = map[string]func(param string) []LuaFunc{
	"log": func(namespace string) []LuaFunc {
		return []LuaFunc{
			{namespace, "append", wrap(makeLogAppend(namespace))},
			{namespace, "query", wrap(makeLogQuery(namespace))},
		}
	},
}

// IsValidClaim reports whether a claim name is recognized.
func IsValidClaim(claim string) bool {
	if _, ok := claims[claim]; ok {
		return true
	}
	prefix, param, found := strings.Cut(claim, ":")
	if !found {
		return false
	}
	if _, ok := parameterizedClaims[prefix]; !ok {
		return false
	}
	return isValidNamespace(param)
}

// isValidNamespace checks that a namespace is safe for use as a directory name.
// Only lowercase alphanumeric and hyphens allowed.
func isValidNamespace(ns string) bool {
	if ns == "" {
		return false
	}
	for _, c := range ns {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
			return false
		}
	}
	return true
}

// InjectAlwaysOn injects all always-on capabilities into the Lua state.
func InjectAlwaysOn(l *lua.State) {
	for _, f := range alwaysOn {
		injectFunc(l, f)
	}
}

// InjectClaim injects all functions granted by a claim into the Lua state.
func InjectClaim(l *lua.State, claim string) {
	if funcs, ok := claims[claim]; ok {
		for _, f := range funcs {
			injectFunc(l, f)
		}
		return
	}
	prefix, param, found := strings.Cut(claim, ":")
	if !found {
		return
	}
	if factory, ok := parameterizedClaims[prefix]; ok {
		for _, f := range factory(param) {
			injectFunc(l, f)
		}
	}
}

// injectFunc injects a single LuaFunc into the Lua state.
func injectFunc(l *lua.State, f LuaFunc) {
	ensureTable(l, f.Namespace)
	l.PushString(f.Name)
	l.PushGoFunction(f.Func)
	l.SetTable(-3)
	l.Pop(1)
}

// wrap uses reflection to turn a Go function into a lua.Function.
//
// The Go function can have any number of typed parameters (string, float64,
// bool, any) and must return (T, error) where T is any type that pushValue
// can handle. Missing Lua args become zero values. Errors become (nil, msg)
// in Lua.
//
// Examples of valid signatures:
//
//	func() (string, error)
//	func(url string) (map[string]any, error)
//	func(path string, content string) (bool, error)
//	func(value any) (string, error)
func wrap(f any) lua.Function {
	fv := reflect.ValueOf(f)
	ft := fv.Type()

	if ft.Kind() != reflect.Func {
		panic("wrap: argument must be a function")
	}
	if ft.NumOut() != 2 || !ft.Out(1).Implements(reflect.TypeOf((*error)(nil)).Elem()) {
		panic("wrap: function must return (T, error)")
	}

	return func(l *lua.State) int {
		// Extract args from Lua stack, converting to the Go parameter types
		args := make([]reflect.Value, ft.NumIn())
		for i := range args {
			if i < l.Top() {
				args[i] = convertArg(l, i+1, ft.In(i))
			} else {
				args[i] = reflect.Zero(ft.In(i))
			}
		}

		results := fv.Call(args)

		// Check error (second return value)
		if errVal := results[1]; !errVal.IsNil() {
			l.PushNil()
			l.PushString(errVal.Interface().(error).Error())
			return 2
		}

		// Push result (first return value)
		pushValue(l, results[0].Interface())
		return 1
	}
}

// convertArg extracts a Lua value at the given stack index and converts it
// to the target Go type.
func convertArg(l *lua.State, index int, target reflect.Type) reflect.Value {
	// Handle `any` / `interface{}` parameter — pass through as-is
	if target.Kind() == reflect.Interface {
		return reflect.ValueOf(luaToGo(l, index))
	}

	switch target.Kind() {
	case reflect.String:
		s, _ := l.ToString(index)
		return reflect.ValueOf(s)
	case reflect.Float64:
		n, _ := l.ToNumber(index)
		return reflect.ValueOf(n)
	case reflect.Bool:
		return reflect.ValueOf(l.ToBoolean(index))
	case reflect.Map, reflect.Slice:
		val := luaToGo(l, index)
		if val == nil {
			return reflect.Zero(target)
		}
		return reflect.ValueOf(val)
	default:
		return reflect.Zero(target)
	}
}

// ensureTable gets or creates a named global table.
func ensureTable(l *lua.State, name string) {
	l.Global(name)
	if !l.IsTable(-1) {
		l.Pop(1)
		l.NewTable()
		l.PushValue(-1)
		l.SetGlobal(name)
	}
}
