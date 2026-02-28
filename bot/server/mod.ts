import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import type { APNsConfig, ServerInterface } from "./types.ts";
import type { InboxStore } from "../inbox.ts";
import type { Gate } from "../utils/gate.ts";
import { ConnectionManager } from "./ws.ts";
import { APNsClient } from "./apns.ts";

export async function createServer(opts: {
  port: number;
  authToken: string;
  inbox: InboxStore;
  gate: Gate;
  apns?: APNsConfig;
  dataDir: string;
  onUserMessage?: (text: string) => void;
}): Promise<ServerInterface> {
  await ensureDir(opts.dataDir);

  const conn = new ConnectionManager({
    authToken: opts.authToken,
    inbox: opts.inbox,
    gate: opts.gate,
  });

  // APNs (optional)
  let apns: APNsClient | null = null;
  if (opts.apns) {
    apns = new APNsClient(opts.apns, opts.dataDir);
    conn.setOnPushToken((token) => apns!.setDeviceToken(token));
  }

  // Push helper — sends push if WS is disconnected
  const pushIfDisconnected = (text: string) => {
    if (!conn.isConnected && apns) {
      apns.sendPush(text);
    }
  };

  // User message callback (for wake activity tracking etc.)
  conn.setOnMessage((text) => opts.onUserMessage?.(text));

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
        const msg = opts.inbox.append("assistant", body.text);
        server.deliver(msg);
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

  const server: ServerInterface = {
    deliver(msg) {
      conn.send({
        type: "message",
        id: msg.id,
        role: "agent",
        content: msg.content,
        createdAt: msg.createdAt,
      });
      pushIfDisconnected(msg.content);
    },

    deliverSystem(msg) {
      conn.send({
        type: "message",
        id: msg.id,
        role: "system",
        content: msg.content,
        createdAt: msg.createdAt,
      });
    },
  };

  return server;
}
