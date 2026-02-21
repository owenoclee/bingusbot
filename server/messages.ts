import { Database } from "jsr:@db/sqlite@0.12";
import { StoredMessage } from "./types.ts";

export class MessageStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv_time
        ON messages (conversation_id, created_at DESC);
    `);
  }

  insert(msg: StoredMessage): void {
    this.db.exec(
      `INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt],
    );
  }

  getHistory(conversationId: string, limit = 100): StoredMessage[] {
    const rows = this.db.prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    ).all(conversationId, limit) as Array<{
      id: string;
      conversation_id: string;
      role: string;
      content: string;
      created_at: number;
    }>;

    return rows.reverse().map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role as "user" | "agent" | "system",
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  getAfter(conversationId: string, afterMs: number): StoredMessage[] {
    const rows = this.db.prepare(
      `SELECT id, conversation_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ? AND created_at > ?
       ORDER BY created_at ASC`,
    ).all(conversationId, afterMs) as Array<{
      id: string;
      conversation_id: string;
      role: string;
      content: string;
      created_at: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role as "user" | "agent" | "system",
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}
