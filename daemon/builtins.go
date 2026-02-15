package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// --- time functions ---

func timeNow() (string, error) {
	return time.Now().UTC().Format("2006-01-02 15:04:05 UTC"), nil
}

func timeUnix() (float64, error) {
	return float64(time.Now().Unix()), nil
}

// --- http functions ---

func httpGet(url string) (map[string]any, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return map[string]any{"status": 0.0, "body": err.Error()}, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return map[string]any{
		"status": float64(resp.StatusCode),
		"body":   string(body),
	}, nil
}

func httpPost(url string, body string, contentType string) (map[string]any, error) {
	if contentType == "" {
		contentType = "application/json"
	}
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Post(url, contentType, strings.NewReader(body))
	if err != nil {
		return map[string]any{"status": 0.0, "body": err.Error()}, nil
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return map[string]any{
		"status": float64(resp.StatusCode),
		"body":   string(respBody),
	}, nil
}

// --- fs functions ---

func fsRead(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func fsWrite(path string, content string) (bool, error) {
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return false, err
	}
	return true, nil
}

func fsList(path string) ([]any, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, err
	}
	result := make([]any, len(entries))
	for i, entry := range entries {
		result[i] = map[string]any{
			"name":   entry.Name(),
			"is_dir": entry.IsDir(),
		}
	}
	return result, nil
}

// --- json functions ---

func jsonEncode(value any) (string, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func jsonDecode(s string) (any, error) {
	var val any
	if err := json.Unmarshal([]byte(s), &val); err != nil {
		return nil, err
	}
	return val, nil
}
