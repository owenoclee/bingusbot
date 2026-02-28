// Package bot is the application entry point. It wires together the inbox,
// server, agent loop, tools, and wake scheduler.

import {
  APNS_CONFIG,
  BINGUS_DIR,
  DB_PATH,
  MODEL,
  OPENROUTER_KEY,
  SYSTEM_PROMPT,
  WS_AUTH_TOKEN,
  WS_PORT,
} from "./config.ts";
import { callTool, RUN_TOOL, TOOL_NAMES, TOOLS_PROMPT } from "./tools/registry.ts";
import { createServer } from "./server/mod.ts";
import { createOpenRouterLLM } from "./llm.ts";
import { InboxStore } from "./inbox.ts";
import { createAgentLoop } from "./loop.ts";
import { Gate } from "./utils/gate.ts";
import { buildContext } from "./context.ts";
import { createWakeScheduler } from "./wake.ts";

const WAKE_FILE = `${BINGUS_DIR}/wake.json`;
const dataDir = DB_PATH.replace(/\/[^/]+$/, "");

const inbox = new InboxStore(DB_PATH);

const gate = new Gate({
  onOpen() {
    wake.setReplying(true);
  },
  onClose() {
    wake.setReplying(false);
    wake.onActivity();
    wake.check();
  },
});

const server = await createServer({
  port: WS_PORT,
  authToken: WS_AUTH_TOKEN,
  inbox,
  gate,
  apns: APNS_CONFIG,
  dataDir,
  onUserMessage(text) {
    console.log(`[user] ${text}`);
    wake.onActivity();
  },
});

const wake = createWakeScheduler({
  quietPeriodMs: 30_000,
  async readSchedule() {
    try {
      return JSON.parse(await Deno.readTextFile(WAKE_FILE));
    } catch {
      return null;
    }
  },
  async clearSchedule() {
    try {
      await Deno.remove(WAKE_FILE);
    } catch { /* already gone */ }
  },
  async onWake(reason) {
    const msg = inbox.append("system", `⏰ Wake: ${reason}`);
    server.deliverSystem(msg);
    gate.open();
  },
});

const loop = createAgentLoop({
  inbox,
  gate,
  llm: createOpenRouterLLM(OPENROUTER_KEY, MODEL),
  tools: { call: callTool },
  toolDefs: [RUN_TOOL],
  systemPrompt: SYSTEM_PROMPT + "\n\n" + TOOLS_PROMPT,
  buildContext,
  onAssistantMessage(msg) {
    server.deliver(msg);
  },
});

loop.start();

console.log(`tools: ${TOOL_NAMES.join(", ")}`);
console.log("bot is online! waiting for messages...");

// Check for pending wake on startup
wake.check();
