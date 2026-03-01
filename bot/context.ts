// Package context builds the LLM conversation from inbox messages. It reads
// from all inboxes, merges by timestamp, and maps each to the appropriate
// LLM message format.

import type { InboxStore, InboxMessage } from "./inbox.ts";
import type { Message } from "./agent.ts";
import { formatTimestamp } from "./utils/time.ts";
import { decodeToolCalls, decodeToolResult } from "./codec.ts";


const ALL_INBOXES = ["user", "assistant", "system", "tool-calls", "tool-results"];

export interface MessageAnnotation {
  message: Message;
  sourceId: string;      // inbox row ID
  sourceInbox: string;
  deferred: boolean;
  deferredBy?: string;   // tool-calls row ID that triggered deferral
}

// Build the LLM context from all inboxes, sorted by timestamp.
//
// User/system messages that arrive mid-tool-exchange (timestamp between a
// tool-calls row and its tool-results) are deferred until after the last
// result. This is a real scenario: a tool can take seconds, during which the
// user sends a message whose created_at sorts between the two.
export function buildContextWithAnnotations(inbox: InboxStore): MessageAnnotation[] {
  const rows = inbox.read(ALL_INBOXES);
  const annotations: MessageAnnotation[] = [];
  const deferred: Array<{ ann: MessageAnnotation; deferredBy: string }> = [];
  let pendingResults = 0;
  let currentToolCallsId = "";

  for (const row of rows) {
    if (row.inbox === "tool-calls") {
      const { calls } = JSON.parse(row.content) as { calls: unknown[] };
      pendingResults += calls.length;
      currentToolCallsId = row.id;
      for (const msg of mapToMessages(row)) {
        annotations.push({ message: msg, sourceId: row.id, sourceInbox: row.inbox, deferred: false });
      }
    } else if (row.inbox === "tool-results") {
      for (const msg of mapToMessages(row)) {
        annotations.push({ message: msg, sourceId: row.id, sourceInbox: row.inbox, deferred: false });
      }
      pendingResults = Math.max(0, pendingResults - 1);
      if (pendingResults === 0 && deferred.length > 0) {
        for (const { ann } of deferred.splice(0)) {
          annotations.push(ann);
        }
        currentToolCallsId = "";
      }
    } else if (pendingResults > 0 && (row.inbox === "user" || row.inbox === "system")) {
      for (const msg of mapToMessages(row)) {
        deferred.push({
          ann: { message: msg, sourceId: row.id, sourceInbox: row.inbox, deferred: true, deferredBy: currentToolCallsId },
          deferredBy: currentToolCallsId,
        });
      }
    } else {
      for (const msg of mapToMessages(row)) {
        annotations.push({ message: msg, sourceId: row.id, sourceInbox: row.inbox, deferred: false });
      }
    }
  }

  // Flush any remaining deferred messages (tool results never came)
  for (const { ann } of deferred) {
    annotations.push(ann);
  }

  return annotations;
}

// Build the LLM context from all inboxes, sorted by timestamp.
export function buildContext(inbox: InboxStore): Message[] {
  return buildContextWithAnnotations(inbox).map((a) => a.message);
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
