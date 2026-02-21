package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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

// --- log functions (generic namespaced JSONL log) ---

// logDir returns the directory for a log namespace, creating it if needed.
// Logs live at ~/.bingus/logs/<namespace>/.
func logDir(namespace string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("getting home dir: %w", err)
	}
	dir := filepath.Join(home, ".bingus", "logs", namespace)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("creating log dir: %w", err)
	}
	return dir, nil
}

// randomID generates a short random hex ID.
func randomID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// makeLogAppend returns a function that appends entries to a namespaced JSONL log.
// The entry data comes as a Lua table (map[string]any). The system injects id and
// createdAt automatically.
func makeLogAppend(namespace string) func(data any) (string, error) {
	return func(data any) (string, error) {
		dir, err := logDir(namespace)
		if err != nil {
			return "", err
		}

		entry, ok := data.(map[string]any)
		if !ok {
			return "", fmt.Errorf("log.append expects a table")
		}

		now := time.Now().UTC()
		entry["id"] = randomID()
		entry["createdAt"] = float64(now.UnixMilli())

		line, err := json.Marshal(entry)
		if err != nil {
			return "", fmt.Errorf("marshaling entry: %w", err)
		}

		filename := now.Format("2006-01-02") + ".jsonl"
		f, err := os.OpenFile(filepath.Join(dir, filename), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err != nil {
			return "", fmt.Errorf("opening log file: %w", err)
		}
		defer f.Close()

		if _, err := f.Write(append(line, '\n')); err != nil {
			return "", fmt.Errorf("writing entry: %w", err)
		}

		return fmt.Sprintf("Logged to %s", namespace), nil
	}
}

// makeLogQuery returns a function that reads entries from a namespaced JSONL log.
// Returns entries since the given time boundary as a JSON array. An optional text
// parameter does case-insensitive substring matching across all string fields.
func makeLogQuery(namespace string) func(since string, text string) (string, error) {
	return func(since string, text string) (string, error) {
		dir, err := logDir(namespace)
		if err != nil {
			return "", err
		}

		cutoff, err := parseSince(since)
		if err != nil {
			return "", err
		}
		cutoffMs := cutoff.UnixMilli()
		textLower := strings.ToLower(text)

		var entries []map[string]any
		for d := cutoff; !d.After(time.Now().UTC()); d = d.AddDate(0, 0, 1) {
			filename := filepath.Join(dir, d.Format("2006-01-02")+".jsonl")
			dayEntries, err := readJSONLFile(filename, cutoffMs, textLower)
			if err != nil {
				continue // file may not exist
			}
			entries = append(entries, dayEntries...)
		}

		result, err := json.Marshal(entries)
		if err != nil {
			return "", fmt.Errorf("marshaling results: %w", err)
		}
		return string(result), nil
	}
}

// parseSince parses a relative duration ("24h", "7d", "30d") or ISO timestamp.
func parseSince(since string) (time.Time, error) {
	if since == "" {
		since = "24h"
	}
	now := time.Now().UTC()

	// Try relative durations: Nd or Nh
	if strings.HasSuffix(since, "d") {
		var days int
		if _, err := fmt.Sscanf(since, "%dd", &days); err == nil {
			return now.AddDate(0, 0, -days), nil
		}
	}
	if strings.HasSuffix(since, "h") {
		var hours int
		if _, err := fmt.Sscanf(since, "%dh", &hours); err == nil {
			return now.Add(-time.Duration(hours) * time.Hour), nil
		}
	}

	// Try ISO 8601
	t, err := time.Parse(time.RFC3339, since)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid since value %q: use '24h', '7d', or ISO timestamp", since)
	}
	return t, nil
}

// readJSONLFile reads entries from a JSONL file, filtering by time cutoff and
// optional text search (case-insensitive substring match across string fields).
func readJSONLFile(path string, cutoffMs int64, textLower string) ([]map[string]any, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var entries []map[string]any
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var entry map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			continue
		}
		if ts, ok := entry["createdAt"].(float64); ok && int64(ts) < cutoffMs {
			continue
		}
		if textLower != "" && !entryMatchesText(entry, textLower) {
			continue
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

// entryMatchesText checks if any string field (including inside arrays)
// contains the search text (already lowercased).
func entryMatchesText(entry map[string]any, textLower string) bool {
	for _, v := range entry {
		switch val := v.(type) {
		case string:
			if strings.Contains(strings.ToLower(val), textLower) {
				return true
			}
		case []any:
			for _, item := range val {
				if s, ok := item.(string); ok {
					if strings.Contains(strings.ToLower(s), textLower) {
						return true
					}
				}
			}
		}
	}
	return false
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
