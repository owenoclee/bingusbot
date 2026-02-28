const BINGUS_DIR = `${Deno.env.get("HOME")}/.bingus`;
const MIN_MS = 60_000; // 1 minute
const MAX_MS = 7 * 24 * 3600_000; // 7 days

export async function schedule_wake(args: Record<string, unknown>): Promise<string> {
  const t = new Date(args.time as string);
  if (isNaN(t.getTime())) {
    throw new Error(`invalid time "${args.time}": must be ISO 8601 (e.g. 2026-02-22T09:00:00Z)`);
  }

  const diff = t.getTime() - Date.now();
  if (diff < MIN_MS) {
    throw new Error(`wake time must be at least 1 minute in the future (got ${Math.round(diff / 1000)}s)`);
  }
  if (diff > MAX_MS) {
    throw new Error(`wake time must be at most 7 days in the future (got ${Math.round(diff / 3600_000)}h)`);
  }

  const wake = {
    wakeAt: t.toISOString(),
    reason: args.reason as string,
  };

  await Deno.mkdir(BINGUS_DIR, { recursive: true });
  await Deno.writeTextFile(
    `${BINGUS_DIR}/wake.json`,
    JSON.stringify(wake, null, 2),
  );

  const formatted = t.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
  return `Wake scheduled for ${formatted}: ${args.reason}`;
}
