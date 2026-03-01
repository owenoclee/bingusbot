// Package context builds the LLM conversation from inbox messages. It reads
// from all inboxes, merges by timestamp, and maps each to the appropriate
// LLM message format.

import type { InboxStore, InboxMessage } from "./inbox.ts";
import type { Message } from "./agent.ts";
import { formatTimestamp } from "./utils/time.ts";
import { decodeToolCalls, decodeToolResult } from "./codec.ts";


const ALL_INBOXES = ["user", "assistant", "system", "tool-calls", "tool-results"];

// Build the LLM context from all inboxes, sorted by timestamp.
//
// User/system messages that arrive mid-tool-exchange (timestamp between a
// tool-calls row and its tool-results) are deferred until after the last
// result. This is a real scenario: a tool can take seconds, during which the
// user sends a message whose created_at sorts between the two.
export function buildContext(inbox: InboxStore): Message[] {
  const rows = inbox.read(ALL_INBOXES);
  const messages: Message[] = [];
  const deferred: Message[] = [];
  let pendingResults = 0;

  for (const row of rows) {
    if (row.inbox === "tool-calls") {
      const { calls } = JSON.parse(row.content) as { calls: unknown[] };
      pendingResults += calls.length;
      messages.push(...mapToMessages(row));
    } else if (row.inbox === "tool-results") {
      messages.push(...mapToMessages(row));
      pendingResults = Math.max(0, pendingResults - 1);
      if (pendingResults === 0 && deferred.length > 0) {
        messages.push(...deferred.splice(0));
      }
    } else if (pendingResults > 0 && (row.inbox === "user" || row.inbox === "system")) {
      deferred.push(...mapToMessages(row));
    } else {
      messages.push(...mapToMessages(row));
    }
  }

  return messages;
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
    case "tool-calls":
      return [decodeToolCalls(row.content)];
    case "tool-results":
      return [decodeToolResult(row.content)];
    default:
      return [];
  }
}
