// Package llm provides the OpenRouter-backed implementation of the LLM
// interface. It handles API authentication and response parsing but exposes
// only the generic LLM interface to callers.

import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import type { LLM, LLMResult, Message, ToolDef } from "./agent.ts";

// createOpenRouterLLM returns an LLM backed by the OpenRouter API.
// Tool calls are unwrapped from the single "run" wrapper so the caller
// sees individual tool names and arguments.
export function createOpenRouterLLM(apiKey: string, model: string): LLM {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  return {
    async complete(messages: Message[], tools: ToolDef[]): Promise<LLMResult> {
      const res = await client.chat.completions.create({
        model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        tools: tools as OpenAI.ChatCompletionTool[],
      });

      const choice = res.choices[0];
      if (!choice) throw new Error("no response from LLM complete");

      const msg = choice.message;
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const calls = msg.tool_calls.map((tc) => {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(tc.function.arguments);
          } catch {
            parsed = {};
          }
          return {
            id: tc.id,
            name: (parsed.name as string) ?? tc.function.name,
            args: (parsed.args as Record<string, unknown>) ?? {},
          };
        });
        return { type: "tool_calls", content: msg.content ?? null, calls };
      }

      return { type: "text", content: msg.content ?? "(no response)" };
    },
  };
}
