import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import type { APNsConfig, ServerInterface, StoredMessage } from "./types.ts";
import { MessageStore } from "./messages.ts";
import { ConnectionManager } from "./ws.ts";
import { APNsClient } from "./apns.ts";

const DEFAULT_CONVERSATION = "default";

export async function createServer(opts: {
  port: number;
  authToken: string;
  dbPath: string;
  apns?: APNsConfig;
}): Promise<ServerInterface> {
  // Ensure data directory exists
  const dataDir = opts.dbPath.replace(/\/[^/]+$/, "");
  await ensureDir(dataDir);

  const store = new MessageStore(opts.dbPath);
  const conn = new ConnectionManager({ authToken: opts.authToken, store });

  // APNs (optional)
  let apns: APNsClient | null = null;
  if (opts.apns) {
    apns = new APNsClient(opts.apns, dataDir);
    conn.setOnPushToken((token) => apns!.setDeviceToken(token));
  }

  // Push helper — sends push if WS is disconnected
  const pushIfDisconnected = (text: string) => {
    if (!conn.isConnected && apns) {
      apns.sendPush(text);
    }
  };

  // User message callback
  let userMessageCallback: ((msg: { conversationId: string; text: string }) => void) | null = null;
  conn.setOnMessage((msg) => userMessageCallback?.(msg));

  // Start HTTP server
  Deno.serve({ port: opts.port }, (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    // POST /send — external trigger for agent messages
    if (url.pathname === "/send" && req.method === "POST") {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${opts.authToken}`) {
        return new Response("unauthorized", { status: 401 });
      }
      return req.json().then((body: { text: string }) => {
        server.sendMessage(DEFAULT_CONVERSATION, body.text);
        return new Response("ok");
      });
    }

    // WebSocket upgrade
    if (url.pathname === "/") {
      const upgrade = req.headers.get("upgrade") ?? "";
      if (upgrade.toLowerCase() !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const { socket, response } = Deno.upgradeWebSocket(req);
      conn.accept(socket);
      return response;
    }

    return new Response("not found", { status: 404 });
  });

  console.log(`server listening on :${opts.port}`);

  // Build the ServerInterface
  const server: ServerInterface = {
    onUserMessage(cb) {
      userMessageCallback = cb;
    },

    async sendMessage(conversationId: string, text: string) {
      const id = crypto.randomUUID();
      const msg: StoredMessage = {
        id,
        conversationId,
        role: "agent",
        content: text,
        createdAt: Date.now(),
      };
      store.insert(msg);
      conn.send({ type: "message", id, role: "agent", content: text, createdAt: msg.createdAt });
      pushIfDisconnected(text);
    },

    async sendSystemMessage(conversationId: string, text: string) {
      const id = crypto.randomUUID();
      const msg: StoredMessage = {
        id,
        conversationId,
        role: "system",
        content: text,
        createdAt: Date.now(),
      };
      store.insert(msg);
      conn.send({ type: "message", id, role: "system", content: text, createdAt: msg.createdAt });
    },

    async getHistory(conversationId: string, limit?: number): Promise<StoredMessage[]> {
      return store.getHistory(conversationId, limit);
    },
  };

  return server;
}
