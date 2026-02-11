# Telegram AI Chatbot

## Overview
BingusBot: a personal AI chatbot accessible via Telegram, powered by OpenRouter LLMs.

## Tech Stack
- **Runtime**: Deno (TypeScript)
- **LLM**: OpenRouter API (OpenAI-compatible) - currently using `google/gemini-3-flash-preview`
- **Messaging**: Telegram Bot API

## File Structure
- **`config.ts`** - All env var reads + constants (model, system prompt, allowed IDs, etc.). Fails fast if required vars are missing.
- **`telegram.ts`** - Telegram API helpers: `telegram()`, `sendMessage()`, `sendMessageDraft()`.
- **`bot.ts`** - Main entry point. Thread persistence, streaming reply, polling loop.

## Environment Variables
- `TELEGRAM_KEY` - Telegram Bot API token
- `OPENROUTER_KEY` - OpenRouter API key
- `ALLOWED_TELEGRAM_IDS` - Comma-separated Telegram user IDs

## Access Control
- Whitelist by Telegram user ID (numeric, immutable - safer than username which can change)
- Bot responds ONLY to whitelisted user(s)
- IDs configured via `ALLOWED_TELEGRAM_IDS` env var

## Running
```bash
deno run --allow-net --allow-env --allow-read --allow-write bot.ts
```
