// Package codec encodes and decodes tool interactions between the LLM wire
// format and the inbox storage format. Co-locating both directions here makes
// the round-trip easy to test and the provider-specific mapping easy to swap.

import type { Message, ToolCall } from "./agent.ts";

interface StoredToolCalls {
  assistantContent: string | null;
  calls: ToolCall[];
}

interface StoredToolResult {
  callId: string;
  result: string;
}

export function encodeToolCalls(
  assistantContent: string | null,
  calls: ToolCall[],
): string {
  return JSON.stringify({ assistantContent, calls } satisfies StoredToolCalls);
}

export function decodeToolCalls(content: string): Message {
  const { assistantContent, calls }: StoredToolCalls = JSON.parse(content);
  return {
    role: "assistant",
    content: assistantContent,
    tool_calls: calls.map((c) => ({
      id: c.id,
      type: "function" as const,
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    })),
  };
}

export function encodeToolResult(callId: string, result: string): string {
  return JSON.stringify({ callId, result } satisfies StoredToolResult);
}

export function decodeToolResult(content: string): Message {
  const { callId, result }: StoredToolResult = JSON.parse(content);
  return { role: "tool", tool_call_id: callId, content: result };
}
