// Mirrors server/types.ts

export interface StoredMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: number;
}

// Client → Server
export type ClientFrame =
  | { type: "auth"; token: string }
  | { type: "message"; text: string }
  | { type: "sync"; after: number }
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
