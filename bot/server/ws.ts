import type { ClientFrame, ServerFrame, StoredMessage } from "./types.ts";
import type { InboxStore } from "../inbox.ts";
import type { Gate } from "../utils/gate.ts";

const DEFAULT_CONVERSATION = "default";

export class ConnectionManager {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private authToken: string;
  private inbox: InboxStore;
  private gate: Gate;
  private onMessage: ((text: string) => void) | null = null;
  private onPushToken: ((token: string) => void) | null = null;

  constructor(opts: { authToken: string; inbox: InboxStore; gate: Gate }) {
    this.authToken = opts.authToken;
    this.inbox = opts.inbox;
    this.gate = opts.gate;
  }

  get isConnected(): boolean {
    return this.socket !== null && this.authenticated;
  }

  setOnMessage(cb: (text: string) => void) {
    this.onMessage = cb;
  }

  setOnPushToken(cb: (token: string) => void) {
    this.onPushToken = cb;
  }

  /** Accept a new WS connection — closes any existing one */
  accept(ws: WebSocket) {
    if (this.socket) {
      try { this.socket.close(4001, "replaced"); } catch { /* already closed */ }
    }
    this.socket = ws;
    this.authenticated = false;

    ws.onmessage = (event) => {
      try {
        const frame: ClientFrame = JSON.parse(event.data);
        this.handleFrame(ws, frame);
      } catch (err) {
        console.error("bad WS frame:", err);
      }
    };

    ws.onclose = () => {
      if (this.socket === ws) {
        this.socket = null;
        this.authenticated = false;
      }
    };

    ws.onerror = (e) => {
      console.error("WS error:", e);
    };
  }

  private handleFrame(ws: WebSocket, frame: ClientFrame) {
    switch (frame.type) {
      case "auth": {
        if (frame.token === this.authToken) {
          this.authenticated = true;
          this.send({ type: "auth_ok" });
          console.log("client authenticated");
        } else {
          this.send({ type: "auth_fail" });
          ws.close(4003, "auth failed");
        }
        break;
      }

      case "message": {
        if (!this.authenticated) return;
        // Persist to user inbox
        const msg = this.inbox.append("user", frame.text);
        // Echo back to client
        this.send({
          type: "message",
          id: msg.id,
          role: "user",
          content: msg.content,
          createdAt: msg.createdAt,
        });
        // Notify bot + callback
        this.onMessage?.(frame.text);
        this.gate.open();
        break;
      }

      case "sync": {
        if (!this.authenticated) return;
        // Only sync user-visible inboxes
        const rows = this.inbox.readAfter(
          ["user", "assistant", "system"],
          frame.after,
        );
        const messages: StoredMessage[] = rows.map((r) => ({
          id: r.id,
          conversationId: DEFAULT_CONVERSATION,
          role: r.inbox === "assistant" ? "agent" as const : r.inbox as "user" | "system",
          content: r.content,
          createdAt: r.createdAt,
        }));
        this.send({ type: "sync_response", messages });
        break;
      }

      case "register_push": {
        if (!this.authenticated) return;
        this.onPushToken?.(frame.deviceToken);
        break;
      }
    }
  }

  /** Send a frame to the connected client (no-op if disconnected) */
  send(frame: ServerFrame) {
    if (this.socket && this.authenticated && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(frame));
    }
  }

}
