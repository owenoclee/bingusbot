// Package loop provides the unified agent loop. A Gate controls when the
// loop runs, and createAgentLoop drives the LLM ↔ tool cycle, persisting
// every step to inboxes.

import type { InboxStore, InboxMessage } from "./inbox.ts";
import type { LLM, Message, ToolDef, ToolRunner } from "./agent.ts";
import type { Gate } from "./utils/gate.ts";

export function createAgentLoop(deps: {
  inbox: InboxStore;
  gate: Gate;
  llm: LLM;
  tools: ToolRunner;
  toolDefs: ToolDef[];
  systemPrompt: string;
  buildContext: (inbox: InboxStore) => Message[];
  onAssistantMessage: (msg: InboxMessage) => void;
}): { start(): void } {
  return {
    start() {
      (async () => {
        while (true) {
          await deps.gate.wait();

          try {
            const messages = deps.buildContext(deps.inbox);
            const result = await deps.llm.complete(
              [{ role: "system", content: deps.systemPrompt }, ...messages],
              deps.toolDefs,
            );

            if (result.type === "text") {
              const text = result.content || "(no response)";
              const msg = deps.inbox.append("assistant", text);
              deps.onAssistantMessage(msg);
              console.log(`  ↳ ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
              continue;
            }

            // Persist tool calls
            deps.inbox.append("tool-calls", JSON.stringify({
              assistantContent: result.content,
              calls: result.calls.map((c) => ({ id: c.id, name: c.name, args: c.args })),
            }));

            // Execute each tool and persist results
            for (const tc of result.calls) {
              console.log(`  [tool] ${tc.name}(${JSON.stringify(tc.args)})`);
              let toolResult: string;
              try {
                toolResult = await deps.tools.call(tc.name, tc.args);
              } catch (err) {
                toolResult = `error: ${err instanceof Error ? err.message : String(err)}`;
              }
              console.log(`  [tool] → ${toolResult.slice(0, 200)}`);

              deps.inbox.append("tool-results", JSON.stringify({
                callId: tc.id,
                result: toolResult,
              }));
            }

            // Self-signal: tool results ready, loop again without closing
            deps.gate.open();
          } catch (err) {
            console.error("agent loop error:", err);
            const msg = deps.inbox.append(
              "assistant",
              `(error: ${err instanceof Error ? err.message : String(err)})`,
            );
            deps.onAssistantMessage(msg);
          }
        }
      })();
    },
  };
}
