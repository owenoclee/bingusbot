package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
)

var registry *Registry

func main() {
	port := flag.Int("port", 8420, "port to listen on")
	toolsDir := flag.String("tools", "../tools", "path to tools directory")
	flag.Parse()

	var err error
	registry, err = LoadRegistry(*toolsDir)
	if err != nil {
		log.Fatalf("failed to load tools: %v", err)
	}

	log.Printf("loaded %d tool(s) from %s", len(registry.Tools), *toolsDir)
	for name := range registry.Tools {
		log.Printf("  → %s", name)
	}

	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/tools", handleTools)
	http.HandleFunc("/call", handleCall)

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("daemon listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func handleTools(w http.ResponseWriter, r *http.Request) {
	schemas := registry.OpenAISchemas()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(schemas)
}

type CallRequest struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type CallResponse struct {
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func handleCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeCallError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	result, err := registry.Execute(req.Name, req.Arguments)
	if err != nil {
		writeCallError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(CallResponse{Result: result})
}

func writeCallError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(CallResponse{Error: msg})
}
