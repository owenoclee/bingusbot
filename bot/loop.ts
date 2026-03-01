// Package loop provides the unified agent loop. createAgentLoop drives the
// LLM ↔ tool cycle, persisting every step to inboxes.
//
// The loop activates reactively: it declares which inbox names should trigger
// a run via `triggers`, subscribes to inbox.onChange, and owns its Gate
// internally. Callers never open the gate explicitly.

import type { InboxStore, InboxMessage } from "./inbox.ts";
import type { LLM, Message, ToolDef, ToolRunner } from "./agent.ts";
import { Gate } from "./utils/gate.ts";
import { encodeToolCalls, encodeToolResult } from "./codec.ts";

export function createAgentLoop(deps: {
  inbox: InboxStore;
  triggers: string[];
  llm: LLM;
  tools: ToolRunner;
  toolDefs: ToolDef[];
  systemPrompt: string;
  buildContext: (inbox: InboxStore) => { messages: Message[]; hasDeferred: boolean };
  onAssistantMessage: (msg: InboxMessage) => void;
  onActive?: () => void;
  onIdle?: () => void;
}): { start(): void } {
  return {
    start() {
      const gate = new Gate({ onOpen: deps.onActive, onClose: deps.onIdle });

      deps.inbox.onChange = (name) => {
        if (deps.triggers.includes(name)) gate.open();
      };

      (async () => {
        while (true) {
          await gate.wait();

          try {
            let keepGoing = true;
            while (keepGoing) {
              keepGoing = false;

              const { messages, hasDeferred } = deps.buildContext(deps.inbox);

              // Skip LLM call if there's nothing new to respond to — e.g. a
              // spurious wakeup after deferred messages were already handled
              // by the previous inner iteration.
              const lastRole = messages.at(-1)?.role;
              if (!lastRole || lastRole === "assistant") break;

              const result = await deps.llm.complete(
                [{ role: "system", content: deps.systemPrompt }, ...messages],
                deps.toolDefs,
              );

              if (result.type === "text") {
                const text = result.content || "(no response)";
                const msg = deps.inbox.append("assistant", text);
                deps.onAssistantMessage(msg);
                console.log(`  ↳ ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
                if (hasDeferred) keepGoing = true;
              } else {
                // Persist tool calls
                deps.inbox.append("tool-calls", encodeToolCalls(result.content, result.calls));

                // Execute each tool and persist results
                for (const tc of result.calls) {
                  const toolName = (tc.args.name as string) ?? tc.name;
                  const toolArgs = (tc.args.args as Record<string, unknown>) ?? {};
                  console.log(`  [tool] ${toolName}(${JSON.stringify(toolArgs)})`);
                  let toolResult: string;
                  try {
                    toolResult = await deps.tools.call(toolName, toolArgs);
                  } catch (err) {
                    toolResult = `error: ${err instanceof Error ? err.message : String(err)}`;
                  }
                  console.log(`  [tool] → ${toolResult.slice(0, 200)}`);
                  deps.inbox.append("tool-results", encodeToolResult(tc.id, toolResult));
                }

                keepGoing = true;
              }
            }
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
