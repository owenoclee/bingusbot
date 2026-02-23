// Package history converts persisted StoredMessages into the Message format
// the agent expects. It is the only place that maps between the server's
// storage model and the LLM's conversation model.

import type { StoredMessage } from "./server/types.ts";
import type { Message } from "./agent.ts";

// formatTimestamp converts a unix-millis timestamp into a short
// human-readable string in the Europe/London timezone.
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// buildLLMMessages converts stored conversation history into LLM messages.
// User and system messages are prefixed with a human-readable timestamp so
// the model has a sense of when things were said.
export function buildLLMMessages(history: StoredMessage[]): Message[] {
  return history.map((m): Message => {
    if (m.role === "agent") {
      return { role: "assistant", content: m.content };
    }
    const time = formatTimestamp(m.createdAt);
    const prefix = m.role === "system" ? `[system @ ${time}]` : `[${time}]`;
    return { role: "user", content: `${prefix} ${m.content}` };
  });
}
