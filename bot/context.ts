// Package context builds the LLM conversation from inbox messages. It reads
// from all inboxes, merges by timestamp, and maps each to the appropriate
// LLM message format.

import type { InboxStore, InboxMessage } from "./inbox.ts";
import type { Message } from "./agent.ts";
import { formatTimestamp } from "./utils/time.ts";

interface ToolCallsContent {
  assistantContent: string | null;
  calls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

interface ToolResultContent {
  callId: string;
  result: string;
}

const ALL_INBOXES = ["user", "assistant", "system", "tool-calls", "tool-results"];

// TODO: it would be invalid for a user message to follow a tool-call
// a tool-call must take priority until a tool-result follows it
export function buildContext(inbox: InboxStore): Message[] {
  const rows = inbox.read(ALL_INBOXES);
  return rows.flatMap((row): Message[] => mapToMessages(row));
}

function mapToMessages(row: InboxMessage): Message[] {
  switch (row.inbox) {
    case "user": {
      const time = formatTimestamp(row.createdAt);
      return [{ role: "user", content: `[${time}] ${row.content}` }];
    }
    case "assistant":
      return [{ role: "assistant", content: row.content }];
    case "system": {
      const time = formatTimestamp(row.createdAt);
      return [{ role: "user", content: `[system @ ${time}] ${row.content}` }];
    }
    case "tool-calls": {
      const parsed: ToolCallsContent = JSON.parse(row.content);
      return [{
        role: "assistant",
        content: parsed.assistantContent,
        tool_calls: parsed.calls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: {
            name: "run",
            arguments: JSON.stringify({ name: c.name, args: c.args }),
          },
        })),
      }];
    }
    case "tool-results": {
      const parsed: ToolResultContent = JSON.parse(row.content);
      return [{
        role: "tool",
        tool_call_id: parsed.callId,
        content: parsed.result,
      }];
    }
    default:
      return [];
  }
}
