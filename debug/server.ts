// Debug server — serves the debug UI and provides REST endpoints for
// reading/writing the bot's SQLite inbox directly.

import { Database } from "jsr:@db/sqlite@0.12";
import { InboxStore } from "../bot/inbox.ts";
import { generateId } from "../bot/utils/id.ts";
import { buildContextWithAnnotations, type MessageAnnotation } from "../bot/context.ts";

const DB_PATH = Deno.env.get("DB_PATH") ??
  `${Deno.env.get("HOME")}/.bingus/messages.db`;
const WS_AUTH_TOKEN = Deno.env.get("WS_AUTH_TOKEN") ?? "";
const WS_PORT = Deno.env.get("WS_PORT") ?? "8421";
const PORT = Number(Deno.env.get("DEBUG_PORT") ?? "3000");

const db = new Database(DB_PATH, { readonly: false });

// Ensure WAL mode for safe concurrent access with the bot process
db.exec("PRAGMA journal_mode=WAL");

const html = await Deno.readTextFile(
  new URL("./index.html", import.meta.url).pathname,
);

// ── Context builder registry ──

type ContextBuilder = (inbox: InboxStore) => { builder: string; messages: MessageAnnotation[]; hasDeferred: boolean };

const contextBuilders: Record<string, ContextBuilder> = {
  default: (inbox) => {
    const { annotations, hasDeferred } = buildContextWithAnnotations(inbox);
    return { builder: "default", messages: annotations, hasDeferred };
  },
};

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  // Serve the UI
  if (url.pathname === "/") {
    // Inject config into the HTML
    const injected = html.replace(
      "/*__CONFIG__*/",
      `window.__CONFIG__ = ${JSON.stringify({ wsAuthToken: WS_AUTH_TOKEN, wsPort: WS_PORT })};`,
    );
    return new Response(injected, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // GET /api/inboxes — list distinct inbox names
  if (url.pathname === "/api/inboxes" && req.method === "GET") {
    const rows = db
      .prepare("SELECT DISTINCT inbox FROM inbox_messages ORDER BY inbox")
      .all() as Array<{ inbox: string }>;
    return Response.json(rows.map((r) => r.inbox));
  }

  // GET /api/messages?inbox=...&after=...&limit=...
  // after is a string row ID ("" = from start)
  if (url.pathname === "/api/messages" && req.method === "GET") {
    const inbox = url.searchParams.get("inbox"); // null = all
    const after = url.searchParams.get("after") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? "500");

    let raw;
    if (inbox) {
      raw = db
        .prepare(
          `SELECT id, inbox, content FROM inbox_messages
           WHERE inbox = ? AND id > ?
           ORDER BY id ASC LIMIT ?`,
        )
        .all(inbox, after, limit) as Array<{ id: string; inbox: string; content: string }>;
    } else {
      raw = db
        .prepare(
          `SELECT id, inbox, content FROM inbox_messages
           WHERE id > ?
           ORDER BY id ASC LIMIT ?`,
        )
        .all(after, limit) as Array<{ id: string; inbox: string; content: string }>;
    }
    return Response.json(raw);
  }

  // POST /api/messages — insert arbitrary inbox data
  if (url.pathname === "/api/messages" && req.method === "POST") {
    const body = await req.json() as { inbox: string; content: string };
    if (!body.inbox || body.content === undefined) {
      return Response.json({ error: "inbox and content required" }, { status: 400 });
    }
    const id = generateId();
    db.exec(
      `INSERT INTO inbox_messages (id, inbox, content) VALUES (?, ?, ?)`,
      [id, body.inbox, body.content],
    );
    return Response.json({ id, inbox: body.inbox, content: body.content });
  }

  // GET /api/context?builder=default
  if (url.pathname === "/api/context" && req.method === "GET") {
    const builderName = url.searchParams.get("builder") ?? "default";
    const builder = contextBuilders[builderName];
    if (!builder) {
      return Response.json({ error: `unknown builder: ${builderName}` }, { status: 400 });
    }
    const inbox = new InboxStore(DB_PATH);
    try {
      const result = builder(inbox);
      return Response.json(result);
    } finally {
      inbox.close();
    }
  }

  return new Response("not found", { status: 404 });
});

console.log(`debug ui: http://localhost:${PORT}`);
