// Stored message (persisted in SQLite)
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: number; // unix ms
}

// Server interface — the clean boundary the bot consumes.
// Messages are already persisted to inboxes before reaching the server;
// deliver/deliverSystem only handle WS delivery and push notifications.
export interface ServerInterface {
  deliver(msg: { id: string; content: string; createdAt: number }): void;
  deliverSystem(msg: { id: string; content: string; createdAt: number }): void;
}

// --- WebSocket protocol frames ---

// Client → Server
export type ClientFrame =
  | { type: "auth"; token: string }
  | { type: "message"; text: string }
  | { type: "sync"; after: number } // unix ms — request missed messages
  | { type: "register_push"; deviceToken: string };

// Server → Client
export type ServerFrame =
  | { type: "auth_ok" }
  | { type: "auth_fail" }
  | { type: "message"; id: string; role: "user" | "agent" | "system"; content: string; createdAt: number }
  | { type: "sync_response"; messages: StoredMessage[] };

// APNs configuration
export interface APNsConfig {
  keyPath: string;   // .p8 file
  keyId: string;
  teamId: string;
  bundleId: string;
  sandbox: boolean;
}
