import type { ClientFrame, ServerFrame, StoredMessage } from "./types.ts";
import type { MessageStore } from "./messages.ts";

const DEFAULT_CONVERSATION = "default";

export class ConnectionManager {
  private socket: WebSocket | null = null;
  private authenticated = false;
  private authToken: string;
  private store: MessageStore;
  private onMessage: ((msg: { conversationId: string; text: string }) => void) | null = null;
  private onPushToken: ((token: string) => void) | null = null;

  // Track in-flight streaming messages so we can send frames
  private activeMessages = new Map<string, { conversationId: string }>();

  constructor(opts: { authToken: string; store: MessageStore }) {
    this.authToken = opts.authToken;
    this.store = opts.store;
  }

  get isConnected(): boolean {
    return this.socket !== null && this.authenticated;
  }

  setOnMessage(cb: (msg: { conversationId: string; text: string }) => void) {
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
        // Store user message
        const msg: StoredMessage = {
          id: crypto.randomUUID(),
          conversationId: DEFAULT_CONVERSATION,
          role: "user",
          content: frame.text,
          createdAt: Date.now(),
        };
        this.store.insert(msg);
        // Echo back to client
        this.send({
          type: "message",
          id: msg.id,
          role: "user",
          content: msg.content,
          createdAt: msg.createdAt,
        });
        // Notify bot
        this.onMessage?.({ conversationId: DEFAULT_CONVERSATION, text: frame.text });
        break;
      }

      case "sync": {
        if (!this.authenticated) return;
        const messages = this.store.getAfter(DEFAULT_CONVERSATION, frame.after);
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

  /** Register an active streaming message */
  trackMessage(messageId: string, conversationId: string) {
    this.activeMessages.set(messageId, { conversationId });
  }

  /** Remove a streaming message from tracking */
  untrackMessage(messageId: string) {
    this.activeMessages.delete(messageId);
  }
}
