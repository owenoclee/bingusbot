function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    Deno.exit(1);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

// --- Always required ---
const OPENROUTER_KEY = requireEnv("OPENROUTER_KEY");

// --- WebSocket server (new) ---
export const WS_PORT = Number(Deno.env.get("WS_PORT") ?? "8421");
export const WS_AUTH_TOKEN = requireEnv("WS_AUTH_TOKEN");
export const DB_PATH = Deno.env.get("DB_PATH") ?? `${Deno.env.get("HOME")}/.bingus/messages.db`;

// --- APNs (optional) ---
export const APNS_KEY_PATH = optionalEnv("APNS_KEY_PATH");
export const APNS_KEY_ID = optionalEnv("APNS_KEY_ID");
export const APNS_TEAM_ID = optionalEnv("APNS_TEAM_ID");
export const APNS_BUNDLE_ID = optionalEnv("APNS_BUNDLE_ID");

export const APNS_CONFIG = APNS_KEY_PATH && APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID
  ? { keyPath: APNS_KEY_PATH, keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, bundleId: APNS_BUNDLE_ID }
  : undefined;

// --- Shared ---
export const MODEL = "google/gemini-3-flash-preview";
export const SYSTEM_PROMPT =
  "You are a helpful personal AI assistant. Keep responses concise.";
export const DAEMON_URL = Deno.env.get("DAEMON_URL") ?? "http://localhost:8420";
export const MAX_TOOL_ROUNDS = 10;

export { OPENROUTER_KEY };
