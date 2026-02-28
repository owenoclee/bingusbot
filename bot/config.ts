// Package config reads all environment variables and exports validated
// constants. It fails fast on missing required values so the rest of the
// application can assume configuration is present and well-formed.

import { requireEnv, optionalEnv } from "./utils/env.ts";

export const MODEL = "google/gemini-3-flash-preview";
export const SYSTEM_PROMPT = `You are a helpful personal AI assistant. Keep responses concise.
When the user mentions activities, meals, exercise, social events, mood, health, sleep, or other life events, log them using the log_event tool. If the user says "log: ..." always log it. Be judicious — log meaningful events, not every trivial detail. When logging, pick a short descriptive type (meal, exercise, social, mood, health, work, sleep, hobby, errand) and write a concise content string.
You can schedule yourself to wake up later using schedule_wake. Use this when you want to check in, follow up on something, or act on a time-sensitive event. When you wake, you'll receive a system message with the reason you set — use it to decide what to do.`;

export const OPENROUTER_KEY = requireEnv("OPENROUTER_KEY");
export const BINGUS_DIR = `${Deno.env.get("HOME")}/.bingus`;
export const WS_PORT = Number(Deno.env.get("WS_PORT") ?? "8421");
export const WS_AUTH_TOKEN = requireEnv("WS_AUTH_TOKEN");
export const DB_PATH = Deno.env.get("DB_PATH") ?? `${BINGUS_DIR}/messages.db`;
export const APNS_CONFIG = (() => {
  const apns_vars = {
    // these are optional, but warn if not given or partially given
    APNS_KEY_PATH: optionalEnv("APNS_KEY_PATH"),
    APNS_KEY_ID: optionalEnv("APNS_KEY_ID"),
    APNS_TEAM_ID: optionalEnv("APNS_TEAM_ID"),
    APNS_BUNDLE_ID: optionalEnv("APNS_BUNDLE_ID"),
  } as const;
  const apnsSet = Object.entries(apns_vars).filter(([_, v]) => v);
  const apnsMissing = Object.entries(apns_vars).filter(([_, v]) => !v);
  if (apnsSet.length > 0 && apnsMissing.length > 0) {
    console.warn(
      `⚠ APNs partially configured — missing: ${apnsMissing.map(([k]) => k).join(", ")}. Push notifications disabled.`
    );
  } else if (apnsSet.length === 0) {
    console.warn("⚠ No APNs env vars set — push notifications disabled.");
  }

  if (apnsMissing.length > 0) {
    return undefined;
  }
  return {
    keyPath: apns_vars.APNS_KEY_PATH!,
    keyId: apns_vars.APNS_KEY_ID!,
    teamId: apns_vars.APNS_TEAM_ID!,
    bundleId: apns_vars.APNS_BUNDLE_ID!,
    sandbox: Deno.env.get("APNS_SANDBOX") !== "false", // default true
  }
})();
