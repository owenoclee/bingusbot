// Debug server — serves the debug UI and provides REST endpoints for
// reading/writing the bot's SQLite inbox directly.

import { InboxStore } from "../bot/inbox.ts";
import { buildContextWithAnnotations, type MessageAnnotation } from "../bot/context.ts";

const DB_PATH = Deno.env.get("DB_PATH") ??
  `${Deno.env.get("HOME")}/.bingus/messages.db`;
const WS_AUTH_TOKEN = Deno.env.get("WS_AUTH_TOKEN") ?? "";
const WS_PORT = Deno.env.get("WS_PORT") ?? "8421";
const PORT = Number(Deno.env.get("DEBUG_PORT") ?? "3000");

const html = await Deno.readTextFile(
  new URL("./index.html", import.meta.url).pathname,
);

// Open a fresh InboxStore for each request so stale file handles are never
// an issue (e.g. after rm ~/.bingus/messages.db + bot restart).
function withInbox<T>(fn: (inbox: InboxStore) => T): T {
  const inbox = new InboxStore(DB_PATH);
  try {
    return fn(inbox);
  } finally {
    inbox.close();
  }
}

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
    return Response.json(withInbox((inbox) => inbox.listInboxes()));
  }

  // GET /api/messages?inbox=...&after=...&limit=...
  // after is a string row ID ("" = from start)
  if (url.pathname === "/api/messages" && req.method === "GET") {
    const inboxName = url.searchParams.get("inbox");
    const after = url.searchParams.get("after") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? "500");

    const rows = withInbox((inbox) =>
      inboxName
        ? inbox.readAfter([inboxName], after).slice(0, limit)
        : inbox.readAll(after, limit)
    );
    return Response.json(rows);
  }

  // POST /api/messages — insert arbitrary inbox data
  if (url.pathname === "/api/messages" && req.method === "POST") {
    const body = await req.json() as { inbox: string; content: string };
    if (!body.inbox || body.content === undefined) {
      return Response.json({ error: "inbox and content required" }, { status: 400 });
    }
    const msg = withInbox((inbox) => inbox.append(body.inbox, body.content));
    return Response.json({ id: msg.id, inbox: msg.inbox, content: msg.content });
  }

  // GET /api/context?builder=default
  if (url.pathname === "/api/context" && req.method === "GET") {
    const builderName = url.searchParams.get("builder") ?? "default";
    const builder = contextBuilders[builderName];
    if (!builder) {
      return Response.json({ error: `unknown builder: ${builderName}` }, { status: 400 });
    }
    return Response.json(withInbox(builder));
  }

  return new Response("not found", { status: 404 });
});

console.log(`debug ui: http://localhost:${PORT}`);
