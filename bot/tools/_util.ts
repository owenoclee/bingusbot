import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const BINGUS_DIR = `${Deno.env.get("HOME")}/.bingus`;

/** 16-char hex random ID. */
export function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Parse relative duration ("24h", "7d", "30d") or ISO 8601 timestamp → Date. */
export function parseSince(since: string): Date {
  if (!since) since = "24h";
  const now = new Date();

  const dayMatch = since.match(/^(\d+)d$/);
  if (dayMatch) {
    return new Date(now.getTime() - parseInt(dayMatch[1]) * 86400_000);
  }

  const hourMatch = since.match(/^(\d+)h$/);
  if (hourMatch) {
    return new Date(now.getTime() - parseInt(hourMatch[1]) * 3600_000);
  }

  const parsed = new Date(since);
  if (isNaN(parsed.getTime())) {
    throw new Error(`invalid since value "${since}": use '24h', '7d', or ISO timestamp`);
  }
  return parsed;
}

/** Returns the log directory for a namespace, creating it if needed. */
function logDir(namespace: string): string {
  const dir = join(BINGUS_DIR, "logs", namespace);
  Deno.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Format a Date as YYYY-MM-DD. */
function dayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Append an entry to a namespaced JSONL log. Auto-injects id + createdAt. */
export async function appendEntry(
  namespace: string,
  data: Record<string, unknown>,
): Promise<string> {
  const dir = logDir(namespace);
  const now = new Date();

  data.id = randomId();
  data.createdAt = now.getTime();

  const line = JSON.stringify(data) + "\n";
  const filename = dayString(now) + ".jsonl";
  const path = join(dir, filename);

  await Deno.writeTextFile(path, line, { append: true, create: true });
  return `Logged to ${namespace}`;
}

/** Check if any string field in an entry matches the search text. */
function entryMatchesText(entry: Record<string, unknown>, textLower: string): boolean {
  for (const v of Object.values(entry)) {
    if (typeof v === "string" && v.toLowerCase().includes(textLower)) return true;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.toLowerCase().includes(textLower)) return true;
      }
    }
  }
  return false;
}

/** Read entries from a namespaced JSONL log since a cutoff, with optional text filter. */
export async function readEntries(
  namespace: string,
  cutoff: Date,
  textLower: string,
): Promise<Record<string, unknown>[]> {
  const dir = logDir(namespace);
  const cutoffMs = cutoff.getTime();
  const entries: Record<string, unknown>[] = [];

  // Iterate day files from cutoff to today
  const d = new Date(cutoff);
  d.setUTCHours(0, 0, 0, 0);
  const today = new Date();

  while (d <= today) {
    const filename = join(dir, dayString(d) + ".jsonl");
    try {
      const text = await Deno.readTextFile(filename);
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          if (typeof entry.createdAt === "number" && entry.createdAt < cutoffMs) continue;
          if (textLower && !entryMatchesText(entry, textLower)) continue;
          entries.push(entry);
        } catch {
          continue;
        }
      }
    } catch {
      // File doesn't exist for this day — fine
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return entries;
}
