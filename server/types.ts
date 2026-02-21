// Stored message (persisted in SQLite)
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: number; // unix ms
}

// Incoming user message (from WS)
export interface IncomingMessage {
  conversationId: string;
  text: string;
}

// Server interface — the clean boundary the bot consumes
export interface ServerInterface {
  onUserMessage(cb: (msg: IncomingMessage) => void): void;
  allocateAgentMessage(conversationId: string): Promise<string>; // returns message ID
  sendToken(messageId: string, token: string): void;
  finalizeMessage(messageId: string, content: string): Promise<void>;
  sendMessage(conversationId: string, text: string): Promise<void>; // non-streaming shorthand
  sendSystemMessage(conversationId: string, text: string): Promise<void>; // system event (wake, etc.)
  getHistory(conversationId: string, limit?: number): Promise<StoredMessage[]>;
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
  | { type: "message_start"; messageId: string }
  | { type: "token"; messageId: string; token: string }
  | { type: "message_end"; messageId: string; content: string }
  | { type: "message"; id: string; role: "user" | "agent" | "system"; content: string; createdAt: number }
  | { type: "sync_response"; messages: StoredMessage[] };

// APNs configuration
export interface APNsConfig {
  keyPath: string;   // .p8 file
  keyId: string;
  teamId: string;
  bundleId: string;
}
