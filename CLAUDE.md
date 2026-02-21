# Personal AI Agent

## Overview
BingusBot: a personal AI agent with a self-hosted WebSocket server and iOS app, powered by OpenRouter LLMs. Supports tool-calling via a Go daemon that executes Lua-based tools.

## Architecture
```
iOS App ──WS/Tailscale──▶ Messaging Server (Deno, Pi)
                                │
                                ├── Bot logic (same process, clean module boundary)
                                │     ├── OpenRouter LLM (streaming)
                                │     └── Tool Daemon (Go, HTTP :8420)
                                │
                                └── APNs (push when app not connected)
```

Two participants: user + agent. Single conversation. The messaging server provides a `ServerInterface` that the bot consumes — the bot never touches WebSockets, SQLite, or APNs directly.

## Tech Stack
- **Runtime**: Deno (TypeScript)
- **LLM**: OpenRouter API (OpenAI-compatible) - currently using `google/gemini-3-flash-preview`
- **Server**: Deno WebSocket server with SQLite persistence
- **iOS App**: Expo (React Native) with Zustand state management
- **Tool Daemon**: Go + Shopify/go-lua
- **Push Notifications**: APNs (native, no Expo push servers)
- **Containerization**: Docker + Docker Compose

## File Structure
- **`config.ts`** - All env var reads + constants (model, system prompt, server config, etc.). Fails fast if required vars are missing.
- **`bot.ts`** - Main entry point. Creates server, streaming LLM replies, tool-calling loop.
- **`tools.ts`** - Daemon HTTP client: `fetchTools()`, `callTool()`.
- **`server/`** - WebSocket messaging server module.
  - `types.ts` - Message types, ServerInterface, WS protocol frame types, APNs config.
  - `mod.ts` - `createServer()` — HTTP server, WS upgrade, implements ServerInterface.
  - `ws.ts` - ConnectionManager — single WS connection, auth, frame send/receive.
  - `messages.ts` - MessageStore — SQLite persistence (jsr:@db/sqlite).
  - `apns.ts` - APNs push notification client (JWT + HTTP/2 via curl).
- **`app/`** - Expo (React Native) iOS app.
  - `app/_layout.tsx` - Root layout, WS connection + push notification setup.
  - `app/index.tsx` - Chat screen.
  - `components/` - MessageBubble, MessageList, InputBar.
  - `lib/ws.ts` - WebSocket client with reconnect + auth.
  - `lib/store.ts` - Zustand message store with streaming support.
  - `lib/types.ts` - Shared types (mirrors server/types.ts).
  - `lib/notifications.ts` - Native APNs token registration.
  - `constants/config.ts` - WS URL, auth token.
- **`daemon/`** - Go daemon that serves tools over HTTP.
  - `main.go` - HTTP server (health, tools, call endpoints).
  - `registry.go` - Tool discovery from Lua files + OpenAI schema generation.
  - `lua.go` - Lua VM sandbox setup, execution, and Go↔Lua marshaling.
  - `capabilities.go` - Claims-based capability injection framework.
  - `builtins.go` - Pure Go implementations of tool capabilities.
- **`tools/`** - Lua tool definitions (add.lua, time.lua, etc.).
- **`Dockerfile`** / **`docker-compose.yml`** - Container setup for the bot + server.

## Environment Variables
- `OPENROUTER_KEY` - OpenRouter API key
- `WS_PORT` - WebSocket server port (default: 8421)
- `WS_AUTH_TOKEN` - Shared secret for WS authentication
- `DB_PATH` - SQLite database path (default: ~/.bingus/messages.db)
- `DAEMON_URL` - Tool daemon URL (optional, defaults to `http://localhost:8420`)
- `APNS_KEY_PATH` - Path to .p8 APNs key file (optional)
- `APNS_KEY_ID` - APNs key ID (optional)
- `APNS_TEAM_ID` - Apple team ID (optional)
- `APNS_BUNDLE_ID` - iOS bundle ID (optional, e.g. com.example.bingus)

## WebSocket Protocol

### Client → Server
- `{ type: "auth", token: "<secret>" }` — first message after connect
- `{ type: "message", text: "..." }` — user sends chat message
- `{ type: "sync", after: <unix_ms> }` — request missed messages
- `{ type: "register_push", deviceToken: "..." }` — APNs device token

### Server → Client
- `{ type: "auth_ok" }` / `{ type: "auth_fail" }`
- `{ type: "message_start", messageId: "..." }` — agent starts responding
- `{ type: "token", messageId: "...", token: "..." }` — streaming token
- `{ type: "message_end", messageId: "...", content: "full text" }` — done
- `{ type: "message", id, role, content, createdAt }` — complete message
- `{ type: "sync_response", messages: [...] }` — history catch-up

## Tool System
- Tools are Lua files in `tools/` defining a `tool` table and `execute(args)` function
- Lua VMs are **bare by default** — only core language features (math, string, table)
- Always-on capabilities (no claim needed): `time.now`, `time.unix`, `json.encode`, `json.decode`
- Tools declare `claims` for additional capabilities (e.g., `http.get`, `fs.read`)
- Available claims: `http.get`, `http.post`, `fs.read`, `fs.write`, `fs.list`

## Running

### Daemon (on host)
```bash
cd daemon && go build -o bingus-daemon . && ./bingus-daemon --tools ../tools
```

### Bot (local, without Docker)
```bash
WS_AUTH_TOKEN=secret DAEMON_URL=http://localhost:8420 deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-ffi --unstable-ffi bot.ts
```

### Bot (Docker)
```bash
docker compose up --build
```

### iOS App
```bash
cd app && npm install && npx expo start --ios
```
