// Package config reads all environment variables and exports validated
// constants. It fails fast on missing required values so the rest of the
// application can assume configuration is present and well-formed.

// requireEnv reads an environment variable or exits the process
// immediately if it is not set.
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    Deno.exit(1);
  }
  return value;
}

// optionalEnv reads an environment variable, returning undefined if
// it is empty or not set.
function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

// --- Always required ---
const OPENROUTER_KEY = requireEnv("OPENROUTER_KEY");

// --- Paths ---
export const BINGUS_DIR = `${Deno.env.get("HOME")}/.bingus`;

// --- WebSocket server ---
export const WS_PORT = Number(Deno.env.get("WS_PORT") ?? "8421");
export const WS_AUTH_TOKEN = requireEnv("WS_AUTH_TOKEN");
export const DB_PATH = Deno.env.get("DB_PATH") ?? `${BINGUS_DIR}/messages.db`;

// --- APNs (optional, but warn if partially configured) ---
const APNS_VARS = {
  APNS_KEY_PATH: optionalEnv("APNS_KEY_PATH"),
  APNS_KEY_ID: optionalEnv("APNS_KEY_ID"),
  APNS_TEAM_ID: optionalEnv("APNS_TEAM_ID"),
  APNS_BUNDLE_ID: optionalEnv("APNS_BUNDLE_ID"),
} as const;

const apnsSet = Object.entries(APNS_VARS).filter(([_, v]) => v);
const apnsMissing = Object.entries(APNS_VARS).filter(([_, v]) => !v);

if (apnsSet.length > 0 && apnsMissing.length > 0) {
  console.warn(
    `⚠ APNs partially configured — missing: ${apnsMissing.map(([k]) => k).join(", ")}. Push notifications disabled.`
  );
} else if (apnsSet.length === 0) {
  console.warn("⚠ No APNs env vars set — push notifications disabled.");
}

const APNS_SANDBOX = Deno.env.get("APNS_SANDBOX") !== "false"; // default: true (sandbox)

export const APNS_CONFIG = apnsMissing.length === 0
  ? { keyPath: APNS_VARS.APNS_KEY_PATH!, keyId: APNS_VARS.APNS_KEY_ID!, teamId: APNS_VARS.APNS_TEAM_ID!, bundleId: APNS_VARS.APNS_BUNDLE_ID!, sandbox: APNS_SANDBOX }
  : undefined;

// --- Shared ---
export const MODEL = "google/gemini-3-flash-preview";
export const SYSTEM_PROMPT = `You are a helpful personal AI assistant. Keep responses concise.

When the user mentions activities, meals, exercise, social events, mood, health, sleep, or other life events, log them using the log_event tool. If the user says "log: ..." always log it. Be judicious — log meaningful events, not every trivial detail. When logging, pick a short descriptive type (meal, exercise, social, mood, health, work, sleep, hobby, errand) and write a concise content string.

You can schedule yourself to wake up later using schedule_wake. Use this when you want to check in, follow up on something, or act on a time-sensitive event. When you wake, you'll receive a system message with the reason you set — use it to decide what to do.`;
export const MAX_TOOL_ROUNDS = 10;

export { OPENROUTER_KEY };
