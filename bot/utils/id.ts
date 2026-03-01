// Slack-style timestamp IDs: "{unix_secs}.{6-digit-subsecond}"
// Subsecond = (ms_within_second * 1000) + per-ms-counter, giving 1M IDs/sec capacity.
// Lexicographic order == chronological order (seconds part is always 10 digits).

let lastMs = -1;
let counter = 0;

export function generateId(): string {
  const now = Date.now();
  if (now === lastMs) {
    counter++;
  } else {
    lastMs = now;
    counter = 0;
  }
  const secs = Math.floor(now / 1000);
  const ms = now % 1000;
  const sub = ms * 1000 + counter;
  return `${secs}.${String(sub).padStart(6, "0")}`;
}

export function idToMs(id: string): number {
  const dot = id.indexOf(".");
  const secs = parseInt(id.slice(0, dot), 10);
  const sub = parseInt(id.slice(dot + 1), 10);
  return secs * 1000 + Math.floor(sub / 1000);
}
