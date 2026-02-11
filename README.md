# BingusBot

Just experimenting. Nothing to see here yet.

Yet another OpenClaw clone! Or something like that...

OpenClaw is an awesome project, it looks like fun and I feel the FOMO. I'm just too cautious to let it loose on my machine, so I started building this.

Implemented:
- [x] Basic Telegram bot
- [x] Core written in TS/Deno
- [x] LLM responses via OpenRouter (Gemini 3 Flash)
- [x] Streaming replies with draft messages
- [x] Conversation history by thread + persistence (JSON on disk)
- [x] User allowlist via Telegram user IDs
- [x] Markdown formatting with plaintext fallback

Ideas:
- [ ] Tools written in Lua, no blanket shell access (quite limiting obviously, but pretty much all security goes out the window here if allowed)
- [ ] Tools have no host access by default, file system/HTTP access must be granted explicitly
- [ ] Core runs inside Docker, tool use interacts with a daemon on the host machine when necessary
- [ ] Move away from Telegram; E2E encryption doesn't apply to bots?
- [ ] Move away from OpenRouter; it is an unnecessary provider in the chain that can theoretically capture the data?
