import { current_time } from "./current_time.ts";
import { log_event } from "./log_event.ts";
import { query_events } from "./query_events.ts";
import { schedule_wake } from "./schedule_wake.ts";

const toolMap = new Map<string, (args: Record<string, unknown>) => Promise<string>>([
  ["current_time", current_time],
  ["log_event", log_event],
  ["query_events", query_events],
  ["schedule_wake", schedule_wake],
]);

export const TOOL_NAMES = [...toolMap.keys()];

export const RUN_TOOL = {
  type: "function" as const,
  function: {
    name: "run",
    description: "Execute a tool. See system prompt for available tools and their parameters.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        args: { type: "object" },
      },
      required: ["name"],
    },
  },
};

export const TOOLS_PROMPT = `## Tools
Call tools using the \`run\` function.

- current_time() — Get the current date and time.
- log_event(type, content, tags?) — Log a life event, activity, meal, or notable occurrence. type is a category (meal, exercise, social, mood, health, work, sleep, hobby, errand, etc.). content is a concise sentence of what happened. tags is optional comma-separated tags.
- query_events(since?, text?, type?, tags?, limit?) — Query logged events. since: time range like '24h', '7d', '30d', or ISO 8601 (default '24h'). text: case-insensitive substring search. type: filter by category. tags: comma-separated, must match all. limit: max results (default 50).
- schedule_wake(time, reason) — Schedule a self-wake. time is ISO 8601 (e.g. 2026-02-22T09:00:00Z). reason is what to check or do. Only one wake pending at a time. Min 1 minute, max 7 days.`;

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const fn = toolMap.get(name);
  if (!fn) throw new Error(`unknown tool: ${name}`);
  return await fn(args);
}
