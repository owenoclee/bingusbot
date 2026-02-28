import { appendEntry } from "./_util.ts";

export async function log_event(args: Record<string, unknown>): Promise<string> {
  const tags = args.tags
    ? String(args.tags).split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];
  return await appendEntry("events", {
    type: args.type,
    content: args.content,
    ...(tags.length > 0 ? { tags } : {}),
  });
}
