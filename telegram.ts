import { TELEGRAM_API } from "./config.ts";

export async function telegram(method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

export async function sendMessage(chatId: number, threadId: number | undefined, text: string, replyToId: number) {
  try {
    await telegram("sendMessage", {
      chat_id: chatId,
      message_thread_id: threadId,
      text,
      reply_to_message_id: replyToId,
      parse_mode: "Markdown",
    });
  } catch {
    // Markdown parse failed, fall back to plain text
    await telegram("sendMessage", {
      chat_id: chatId,
      message_thread_id: threadId,
      text,
      reply_to_message_id: replyToId,
    });
  }
}

export function sendMessageDraft(chatId: number, threadId: number | undefined, draftId: number, text: string) {
  telegram("sendMessageDraft", {
    chat_id: chatId,
    message_thread_id: threadId,
    draft_id: draftId,
    text,
  }).catch((e) => console.error(`  draft error:`, e.message));
}
