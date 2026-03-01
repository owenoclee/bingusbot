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

// Build the LLM context from all inboxes, sorted by ID.
//
// User/system messages that arrive mid-tool-exchange are deferred until the
// assistant has responded to the tool results. This avoids presenting the
// model with a tool-result and a new user message simultaneously before it
// has had a chance to close out the tool exchange.
//
// hasDeferred is true when messages are waiting to be flushed (i.e. a
// tool exchange completed but no assistant response has been stored yet).
// The loop uses this to re-open the gate after storing the text response.
export function buildContextWithAnnotations(inbox: InboxStore): {
  annotations: MessageAnnotation[];
  hasDeferred: boolean;
} {
  const rows = inbox.read(ALL_INBOXES);
  const annotations: MessageAnnotation[] = [];
  const deferred: Array<{ ann: MessageAnnotation }> = [];
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
    } else if (pendingResults > 0 && (row.inbox === "user" || row.inbox === "system")) {
      for (const msg of mapToMessages(row)) {
        deferred.push({
          ann: { message: msg, sourceId: row.id, sourceInbox: row.inbox, deferred: true, deferredBy: currentToolCallsId },
        });
      }
    } else if (row.inbox === "assistant" && pendingResults === 0 && deferred.length > 0) {
      // Flush deferred messages after the assistant has responded to the tool exchange
      for (const msg of mapToMessages(row)) {
        annotations.push({ message: msg, sourceId: row.id, sourceInbox: row.inbox, deferred: false });
      }
      for (const { ann } of deferred.splice(0)) {
        annotations.push(ann);
      }
      currentToolCallsId = "";
    } else {
      for (const msg of mapToMessages(row)) {
        annotations.push({ message: msg, sourceId: row.id, sourceInbox: row.inbox, deferred: false });
      }
    }
  }

  return { annotations, hasDeferred: deferred.length > 0 };
}

// Build the LLM context from all inboxes, sorted by ID.
export function buildContext(inbox: InboxStore): { messages: Message[]; hasDeferred: boolean } {
  const { annotations, hasDeferred } = buildContextWithAnnotations(inbox);
  return { messages: annotations.map((a) => a.message), hasDeferred };
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
