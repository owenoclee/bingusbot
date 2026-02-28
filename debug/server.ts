// Debug server — serves the debug UI and provides REST endpoints for
// reading/writing the bot's SQLite inbox directly.

import { Database } from "jsr:@db/sqlite@0.12";

const DB_PATH = Deno.env.get("DB_PATH") ??
  `${Deno.env.get("HOME")}/.bingus/messages.db`;
const WS_AUTH_TOKEN = Deno.env.get("WS_AUTH_TOKEN") ?? "";
const WS_PORT = Deno.env.get("WS_PORT") ?? "8421";
const PORT = Number(Deno.env.get("DEBUG_PORT") ?? "3000");

const db = new Database(DB_PATH, { readonly: false });

// Ensure WAL mode for safe concurrent access with the bot process
db.exec("PRAGMA journal_mode=WAL");

// Cast created_at to text in queries to avoid int32 truncation of unix-ms timestamps.
// The DB library returns JS numbers which lose precision above 2^31.

const html = await Deno.readTextFile(
  new URL("./index.html", import.meta.url).pathname,
);

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
  if (url.pathname === "/api/messages" && req.method === "GET") {
    const inbox = url.searchParams.get("inbox"); // null = all
    const after = Number(url.searchParams.get("after") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "500");

    let raw;
    if (inbox) {
      raw = db
        .prepare(
          `SELECT id, inbox, content, CAST(created_at AS TEXT) AS created_at FROM inbox_messages
           WHERE inbox = ? AND created_at > ?
           ORDER BY created_at ASC LIMIT ?`,
        )
        .all(inbox, after, limit) as Array<{ id: string; inbox: string; content: string; created_at: string }>;
    } else {
      raw = db
        .prepare(
          `SELECT id, inbox, content, CAST(created_at AS TEXT) AS created_at FROM inbox_messages
           WHERE created_at > ?
           ORDER BY created_at ASC LIMIT ?`,
        )
        .all(after, limit) as Array<{ id: string; inbox: string; content: string; created_at: string }>;
    }
    const rows = raw.map((r) => ({ ...r, created_at: Number(r.created_at) }));
    return Response.json(rows);
  }

  // POST /api/messages — insert arbitrary inbox data
  if (url.pathname === "/api/messages" && req.method === "POST") {
    const body = await req.json() as { inbox: string; content: string };
    if (!body.inbox || body.content === undefined) {
      return Response.json({ error: "inbox and content required" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    db.exec(
      `INSERT INTO inbox_messages (id, inbox, content, created_at) VALUES (?, ?, ?, ?)`,
      [id, body.inbox, body.content, createdAt],
    );
    return Response.json({ id, inbox: body.inbox, content: body.content, created_at: createdAt });
  }

  return new Response("not found", { status: 404 });
});

console.log(`debug ui: http://localhost:${PORT}`);
