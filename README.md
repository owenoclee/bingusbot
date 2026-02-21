# BingusBot

A personal AI agent with a self-hosted WebSocket server and iOS app, powered by OpenRouter LLMs.

Built to minimise the number of providers that can read conversations — no Telegram, no third-party push servers. Just a Deno server on a Raspberry Pi (accessed over Tailscale) and a native iOS app via TestFlight.

Implemented:
- [x] Core written in TS/Deno
- [x] LLM responses via OpenRouter (Gemini 3 Flash) with streaming
- [x] WebSocket server with SQLite message persistence
- [x] iOS app (Expo/React Native) with real-time streaming, markdown rendering
- [x] APNs push notifications (native, no Expo servers)
- [x] Conversation history with sync on reconnect
- [x] Tools written in Lua, no blanket shell access
- [x] Tools have no host access by default, file system/HTTP access must be granted explicitly via claims
- [x] Core runs inside Docker, tool use interacts with a Go daemon on the host machine

Ideas:
- [ ] Move away from OpenRouter; it is an unnecessary provider in the chain that can theoretically capture the data?
- [ ] TLS via Tailscale certs
- [ ] Bot-initiated messages (cron, external triggers)
