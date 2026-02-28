// Package agent defines the shared types used by the LLM, tools, and agent
// loop. It has no knowledge of networking, persistence, or any specific
// LLM provider.

// Message is a single entry in a conversation, structurally compatible
// with the OpenAI chat completions API.
export type Message =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: RawToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

// RawToolCall is the wire format for a tool call as returned by the LLM.
interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// ToolDef describes a tool the LLM can invoke, using the OpenAI
// function-calling schema.
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ToolCall is a parsed tool invocation with the name and arguments
// already extracted from the raw JSON.
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// LLMResult is either a plain text reply or a set of tool calls
// the agent must execute before continuing.
export type LLMResult =
  | { type: "text"; content: string }
  | { type: "tool_calls"; content: string | null; calls: ToolCall[] };

// LLM abstracts a chat completion provider. Implementations handle
// authentication, streaming, and response parsing.
export interface LLM {
  complete(messages: Message[], tools: ToolDef[]): Promise<LLMResult>;
}

// ToolRunner executes a named tool with the given arguments and returns
// the result as a string for inclusion in the conversation.
export interface ToolRunner {
  call(name: string, args: Record<string, unknown>): Promise<string>;
}
