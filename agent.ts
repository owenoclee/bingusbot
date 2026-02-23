// Package agent defines the core agent loop and its supporting types.
// It owns the LLM ↔ tool-calling cycle but has no knowledge of networking,
// persistence, or any specific LLM provider.

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

// AgentDeps holds everything the agent needs to produce a reply:
// an LLM, tools, and configuration.
export interface AgentDeps {
  llm: LLM;
  tools: ToolRunner;
  toolDefs: ToolDef[];
  systemPrompt: string;
  maxToolRounds: number;
}

// agentReply runs the tool-calling loop: it sends history to the LLM,
// executes any requested tools, and repeats until the LLM produces a
// text reply or maxToolRounds is exhausted.
export async function agentReply(
  deps: AgentDeps,
  history: Message[],
): Promise<string> {
  const messages: Message[] = [
    { role: "system", content: deps.systemPrompt },
    ...history,
  ];

  for (let round = 0; round < deps.maxToolRounds; round++) {
    const result = await deps.llm.complete(messages, deps.toolDefs);

    if (result.type === "text") {
      return result.content || "(no response)";
    }

    // Build assistant message with tool calls for conversation continuity
    messages.push({
      role: "assistant",
      content: result.content,
      tool_calls: result.calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: "run",
          arguments: JSON.stringify({ name: tc.name, args: tc.args }),
        },
      })),
    });

    // Execute each tool call
    for (const tc of result.calls) {
      console.log(`  [tool] ${tc.name}(${JSON.stringify(tc.args)})`);
      let toolResult: string;
      try {
        toolResult = await deps.tools.call(tc.name, tc.args);
      } catch (err) {
        toolResult = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
      console.log(`  [tool] → ${toolResult.slice(0, 200)}`);

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  return "(max tool rounds reached)";
}
