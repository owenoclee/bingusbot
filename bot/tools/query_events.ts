import { parseSince, readEntries } from "./_util.ts";

export async function query_events(args: Record<string, unknown>): Promise<string> {
  const cutoff = parseSince(args.since as string || "24h");
  const entries = await readEntries("events", cutoff, (args.text as string || "").toLowerCase());

  const filterType = args.type as string || "";
  const wantTags = args.tags
    ? String(args.tags).split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];
  const limit = (args.limit as number) || 50;

  let results = entries.filter((e) => {
    if (filterType && e.type !== filterType) return false;
    if (wantTags.length > 0) {
      const eventTags = Array.isArray(e.tags) ? e.tags as string[] : [];
      const tagSet = new Set(eventTags);
      if (!wantTags.every((t) => tagSet.has(t))) return false;
    }
    return true;
  });

  // Keep most recent up to limit
  if (results.length > limit) {
    results = results.slice(-limit);
  }

  return JSON.stringify(results);
}
