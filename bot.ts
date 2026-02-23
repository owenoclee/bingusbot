// Package bot is the application entry point. It wires together the server,
// agent, tools, and wake scheduler, and routes incoming user messages through
// the agent reply loop.

import {
  APNS_CONFIG,
  BINGUS_DIR,
  DB_PATH,
  MAX_TOOL_ROUNDS,
  MODEL,
  OPENROUTER_KEY,
  SYSTEM_PROMPT,
  WS_AUTH_TOKEN,
  WS_PORT,
} from "./config.ts";
import { callTool, RUN_TOOL, TOOL_NAMES, TOOLS_PROMPT } from "./tools/registry.ts";
import { createServer } from "./server/mod.ts";
import { createOpenRouterLLM } from "./llm.ts";
import { agentReply } from "./agent.ts";
import type { AgentDeps } from "./agent.ts";
import { buildLLMMessages } from "./history.ts";
import { createWakeScheduler } from "./wake.ts";

const WAKE_FILE = `${BINGUS_DIR}/wake.json`;
const DEFAULT_CONVERSATION = "default";

const server = await createServer({
  port: WS_PORT,
  authToken: WS_AUTH_TOKEN,
  dbPath: DB_PATH,
  apns: APNS_CONFIG,
});

const agent: AgentDeps = {
  llm: createOpenRouterLLM(OPENROUTER_KEY, MODEL),
  tools: { call: callTool },
  toolDefs: [RUN_TOOL],
  systemPrompt: SYSTEM_PROMPT + "\n\n" + TOOLS_PROMPT,
  maxToolRounds: MAX_TOOL_ROUNDS,
};

console.log(`tools: ${TOOL_NAMES.join(", ")}`);

// reply fetches recent history for a conversation, runs the agent's
// tool-calling loop, and sends the final response back through the server.
async function reply(conversationId: string): Promise<void> {
  const history = await server.getHistory(conversationId, 100);
  const messages = buildLLMMessages(history);
  const text = await agentReply(agent, messages);
  await server.sendMessage(conversationId, text);
  console.log(`  ↳ ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
}

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
    await server.sendSystemMessage(DEFAULT_CONVERSATION, `⏰ Wake: ${reason}`);
    try {
      await reply(DEFAULT_CONVERSATION);
    } catch (err) {
      console.error("wake reply error:", err);
      await server.sendMessage(DEFAULT_CONVERSATION, "(error during wake)");
    }
  },
});

server.onUserMessage(async (msg) => {
  console.log(`[user] ${msg.text}`);
  wake.onActivity();
  wake.setReplying(true);
  try {
    await reply(msg.conversationId);
  } catch (err) {
    console.error("reply error:", err);
    await server.sendMessage(msg.conversationId, "(error processing message)");
  } finally {
    wake.setReplying(false);
    wake.onActivity();
  }
  wake.check();
});

// Check for pending wake on startup
wake.check();

console.log("bot is online! waiting for messages...");
