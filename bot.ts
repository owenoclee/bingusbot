import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
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
import { callTool, fetchTools } from "./tools.ts";
import { createServer } from "./server/mod.ts";

type Message = OpenAI.ChatCompletionMessageParam;

const WAKE_FILE = `${BINGUS_DIR}/wake.json`;

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_KEY,
});

// Start the server
const server = await createServer({
  port: WS_PORT,
  authToken: WS_AUTH_TOKEN,
  dbPath: DB_PATH,
  apns: APNS_CONFIG,
});

// Fetch tools from daemon at startup
const tools = await fetchTools();
if (tools.length > 0) {
  console.log(`loaded ${tools.length} tool(s) from daemon:`);
  for (const t of tools) console.log(`  → ${t.function.name}`);
} else {
  console.log("no tools available (daemon unreachable or no tools loaded)");
}

const DEFAULT_CONVERSATION = "default";
const WAKE_QUIET_PERIOD_MS = 30 * 1000; // 30 seconds

// --- Wake scheduling ---

interface WakeSchedule {
  wakeAt: string; // ISO 8601
  reason: string;
}

let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityMs = 0; // timestamp of last user message or agent reply
let replying = false;

async function loadWakeSchedule(): Promise<WakeSchedule | null> {
  try {
    const text = await Deno.readTextFile(WAKE_FILE);
    return JSON.parse(text) as WakeSchedule;
  } catch {
    return null;
  }
}

async function clearWakeFile(): Promise<void> {
  try {
    await Deno.remove(WAKE_FILE);
  } catch {
    // Already gone — fine
  }
}

function scheduleWake(): void {
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }

  loadWakeSchedule().then((schedule) => {
    if (!schedule) return;

    const wakeAt = new Date(schedule.wakeAt).getTime();
    const delay = Math.max(0, wakeAt - Date.now());

    // Ensure we don't fire during or immediately after a conversation.
    // If the wake time has passed but conversation is recent, defer until
    // the quiet period elapses.
    const quietUntil = lastActivityMs + WAKE_QUIET_PERIOD_MS;
    const effectiveDelay = Math.max(delay, quietUntil - Date.now());

    if (effectiveDelay <= 0) {
      console.log(`[wake] firing now: ${schedule.reason}`);
      wake(schedule.reason);
      return;
    }

    console.log(`[wake] scheduled in ${Math.round(effectiveDelay / 60000)}m: ${schedule.reason}`);
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      // Re-check quiet period — new activity may have happened while we waited
      const sinceLastActivity = Date.now() - lastActivityMs;
      if (replying || sinceLastActivity < WAKE_QUIET_PERIOD_MS) {
        console.log(`[wake] conversation active, deferring`);
        scheduleWake(); // re-schedule, will defer again
        return;
      }
      wake(schedule.reason);
    }, effectiveDelay);
  });
}

async function wake(reason: string): Promise<void> {
  console.log(`[wake] waking: ${reason}`);
  await clearWakeFile();

  const systemText = `⏰ Wake: ${reason}`;
  await server.sendSystemMessage(DEFAULT_CONVERSATION, systemText);

  try {
    replying = true;
    await reply(DEFAULT_CONVERSATION, systemText);
  } catch (err) {
    console.error("wake reply error:", err);
    await server.sendMessage(DEFAULT_CONVERSATION, "(error during wake)");
  } finally {
    replying = false;
    lastActivityMs = Date.now();
  }

  // Agent may have scheduled a new wake during its response
  scheduleWake();
}

// Streaming reply loop
async function reply(conversationId: string, userText: string) {
  // Build LLM messages from stored history
  const history = await server.getHistory(conversationId, 100);
  const llmMessages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: (m.role === "agent" ? "assistant" : "user") as "assistant" | "user",
      content: m.role === "system" ? `[system] ${m.content}` : m.content,
    })),
  ];

  // The latest user message is already in history (stored by ConnectionManager),
  // but we need to make sure it's included in the LLM context.
  // If the last message in history isn't the user's latest, append it.
  const lastHistoryMsg = llmMessages[llmMessages.length - 1];
  if (!lastHistoryMsg || lastHistoryMsg.role !== "user" || lastHistoryMsg.content !== userText) {
    llmMessages.push({ role: "user", content: userText });
  }

  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages: llmMessages,
      ...(tools.length > 0 ? { tools } : {}),
      stream: true,
    });

    // Accumulate the response
    let contentAccum = "";
    const toolCallAccum: Map<number, {
      id: string;
      name: string;
      arguments: string;
    }> = new Map();
    let messageId: string | null = null;
    let hasToolCalls = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Stream text content
      if (delta.content) {
        if (!messageId) {
          messageId = await server.allocateAgentMessage(conversationId);
        }
        contentAccum += delta.content;
        server.sendToken(messageId, delta.content);
      }

      // Accumulate tool call deltas
      if (delta.tool_calls) {
        hasToolCalls = true;
        for (const tc of delta.tool_calls) {
          const existing = toolCallAccum.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          } else {
            toolCallAccum.set(tc.index, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            });
          }
        }
      }
    }

    // If we got tool calls, execute them and loop
    if (hasToolCalls && toolCallAccum.size > 0) {
      // Build the assistant message with tool_calls
      const toolCalls = [...toolCallAccum.values()].map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));

      const assistantMsg: Message = {
        role: "assistant",
        content: contentAccum || null,
        tool_calls: toolCalls,
      };
      llmMessages.push(assistantMsg);

      // Execute each tool call
      for (const tc of toolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
        console.log(`  [tool] ${tc.function.name}(${JSON.stringify(args)})`);

        let result: string;
        try {
          result = await callTool(tc.function.name, args);
        } catch (err) {
          result = `error: ${err instanceof Error ? err.message : String(err)}`;
        }
        console.log(`  [tool] → ${result.slice(0, 200)}`);

        llmMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      continue; // next round
    }

    // No tool calls — finalize the text response
    finalText = contentAccum || "(no response)";
    if (messageId) {
      await server.finalizeMessage(messageId, finalText);
    } else {
      // No tokens were streamed (shouldn't happen, but handle it)
      await server.sendMessage(conversationId, finalText);
    }
    break;
  }

  if (!finalText) {
    finalText = "(max tool rounds reached)";
    await server.sendMessage(conversationId, finalText);
  }

  console.log(`  ↳ ${finalText.slice(0, 100)}${finalText.length > 100 ? "..." : ""}`);
}

// Wire up the message handler
server.onUserMessage(async (msg) => {
  console.log(`[user] ${msg.text}`);
  lastActivityMs = Date.now();
  replying = true;
  try {
    await reply(msg.conversationId, msg.text);
  } catch (err) {
    console.error("reply error:", err);
    await server.sendMessage(msg.conversationId, "(error processing message)");
  } finally {
    replying = false;
    lastActivityMs = Date.now();
  }
  // Agent may have scheduled a wake during its response
  scheduleWake();
});

// Check for pending wake on startup
scheduleWake();

console.log("bot is online! waiting for messages...");
