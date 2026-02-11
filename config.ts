function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    Deno.exit(1);
  }
  return value;
}

const TELEGRAM_KEY = requireEnv("TELEGRAM_KEY");
const OPENROUTER_KEY = requireEnv("OPENROUTER_KEY");

const allowedRaw = requireEnv("ALLOWED_TELEGRAM_IDS");
export const ALLOWED_USER_IDS: Set<number> = new Set(
  allowedRaw.split(",").map((s) => {
    const n = Number(s.trim());
    if (!Number.isInteger(n)) {
      console.error(`Invalid ID in ALLOWED_TELEGRAM_IDS: "${s.trim()}"`);
      Deno.exit(1);
    }
    return n;
  }),
);

export const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_KEY}`;
export const MODEL = "google/gemini-3-flash-preview";
export const SYSTEM_PROMPT =
  "You are a helpful personal AI assistant on Telegram. Keep responses concise.";
export const DRAFT_INTERVAL_MS = 300;
export const THREADS_DIR = `${Deno.env.get("HOME")}/.bingus/threads`;

export { OPENROUTER_KEY };
