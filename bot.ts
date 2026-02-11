import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import {
  ALLOWED_USER_IDS,
  DRAFT_INTERVAL_MS,
  MODEL,
  OPENROUTER_KEY,
  SYSTEM_PROMPT,
  THREADS_DIR,
} from "./config.ts";
import { sendMessage, sendMessageDraft, telegram } from "./telegram.ts";

type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_KEY,
});

await ensureDir(THREADS_DIR);

// Thread history persistence

function threadPath(threadId: number): string {
  return `${THREADS_DIR}/${threadId}.json`;
}

async function loadThread(threadId: number): Promise<Message[]> {
  try {
    const data = await Deno.readTextFile(threadPath(threadId));
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveThread(threadId: number, messages: Message[]) {
  await Deno.writeTextFile(
    threadPath(threadId),
    JSON.stringify(messages, null, 2),
  );
}

// Streaming reply with history

async function streamReply(
  chatId: number,
  threadId: number | undefined,
  replyToId: number,
  userMessage: string,
) {
  const historyKey = threadId ?? chatId;
  const history = await loadThread(historyKey);
  history.push({ role: "user", content: userMessage });

  const stream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
    ],
  });

  const draftId = replyToId;
  let text = "";
  let lastDraftAt = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    text += delta;

    const now = Date.now();
    if (now - lastDraftAt >= DRAFT_INTERVAL_MS && text.length > 0) {
      lastDraftAt = now;
      sendMessageDraft(chatId, threadId, draftId, text);
    }
  }

  const reply = text || "(no response)";
  history.push({ role: "assistant", content: reply });
  await saveThread(historyKey, history);

  return reply;
}

// Main loop

let offset = 0;

console.log("Bot is online! Waiting for messages...");

while (true) {
  try {
    const updates = await telegram("getUpdates", {
      offset,
      timeout: 30,
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text) continue;

      const userId = msg.from.id;
      const username = msg.from.username ?? "unknown";
      console.log(`[${username} / ${userId}] ${msg.text}`);

      if (!ALLOWED_USER_IDS.has(userId)) {
        console.log(`  ↳ blocked (not in allowlist)`);
        continue;
      }

      const reply = await streamReply(
        msg.chat.id,
        msg.message_thread_id,
        msg.message_id,
        msg.text,
      );
      console.log(
        `  ↳ ${reply.slice(0, 100)}${reply.length > 100 ? "..." : ""}`,
      );

      await sendMessage(
        msg.chat.id,
        msg.message_thread_id,
        reply,
        msg.message_id,
      );
    }
  } catch (err) {
    console.error("Error:", err);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
