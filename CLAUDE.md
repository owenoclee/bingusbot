# Personal AI Agent

## Overview
BingusBot: a personal AI agent with a self-hosted WebSocket server and iOS app, powered by OpenRouter LLMs. Tools are plain TypeScript functions running in-process.

## Architecture
```
iOS App ──WS/Tailscale──▶ Messaging Server (Deno, Pi)
                                │
                                ├── Bot logic (same process, clean module boundary)
                                │     ├── OpenRouter LLM (streaming)
                                │     └── Tools (in-process TS functions)
                                │
                                └── APNs (push when app not connected)
```

Two participants: user + agent. Single conversation. The messaging server provides a `ServerInterface` that the bot consumes — the bot never touches WebSockets, SQLite, or APNs directly.

## Tech Stack
- **Runtime**: Deno (TypeScript)
- **LLM**: OpenRouter API (OpenAI-compatible) - currently using `google/gemini-3-flash-preview`
- **Server**: Deno WebSocket server with SQLite persistence
- **iOS App**: Expo (React Native) with Zustand state management
- **Push Notifications**: APNs (native, no Expo push servers)

## File Structure
- **`config.ts`** - All env var reads + constants (model, system prompt, server config, etc.). Fails fast if required vars are missing.
- **`bot.ts`** - Main entry point. Creates server, streaming LLM replies, tool-calling loop.
- **`tools/`** - In-process tool system.
  - `registry.ts` - `RUN_TOOL` definition, `TOOLS_PROMPT`, `TOOL_NAMES`, `callTool()`.
  - `_util.ts` - Shared helpers: `randomId`, `parseSince`, `appendEntry`, `readEntries` (JSONL log).
  - `current_time.ts` - Returns current UTC time.
  - `log_event.ts` - Appends life events to `~/.bingus/logs/events/YYYY-MM-DD.jsonl`.
  - `query_events.ts` - Queries logged events by time, type, tags, text.
  - `schedule_wake.ts` - Writes `~/.bingus/wake.json` for self-wake scheduling.
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

## Environment Variables
- `OPENROUTER_KEY` - OpenRouter API key
- `WS_PORT` - WebSocket server port (default: 8421)
- `WS_AUTH_TOKEN` - Shared secret for WS authentication
- `DB_PATH` - SQLite database path (default: ~/.bingus/messages.db)
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
- Tools are plain async functions in `tools/` (no schema boilerplate)
- A single `run(name, args)` OpenAI tool definition is sent to the LLM; tool descriptions live in `TOOLS_PROMPT` (plain text appended to the system prompt)
- `tools/registry.ts` exports `RUN_TOOL`, `TOOLS_PROMPT`, `TOOL_NAMES`, and `callTool()`
- To add a tool: create `tools/my_tool.ts` with an exported async function, add it to the `toolMap` in `registry.ts`, and add a line to `TOOLS_PROMPT`

## Running

### Bot
```bash
WS_AUTH_TOKEN=secret deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-ffi --unstable-ffi bot.ts
```

### iOS App
```bash
cd app && npm install && npx expo start --ios
```
