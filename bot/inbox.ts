// Package inbox provides a SQLite-backed append-only message store organised
// by named inboxes. Each inbox is a logical stream (e.g. "user", "assistant",
// "tool-calls") and messages are ordered globally by timestamp.

import { Database } from "jsr:@db/sqlite@0.12";

export interface InboxMessage {
  id: string;
  inbox: string;
  content: string;
  createdAt: number; // unix ms
}

export class InboxStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inbox_messages (
        id TEXT PRIMARY KEY,
        inbox TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_time
        ON inbox_messages (inbox, created_at ASC);
    `);
  }

  append(inbox: string, content: string): InboxMessage {
    const msg: InboxMessage = {
      id: crypto.randomUUID(),
      inbox,
      content,
      createdAt: Date.now(),
    };
    this.db.exec(
      `INSERT INTO inbox_messages (id, inbox, content, created_at)
       VALUES (?, ?, ?, ?)`,
      [msg.id, msg.inbox, msg.content, msg.createdAt],
    );
    return msg;
  }

  read(inboxes: string[], limit = 200): InboxMessage[] {
    const placeholders = inboxes.map(() => "?").join(", ");
    const rows = this.db.prepare(
      `SELECT id, inbox, content, CAST(created_at AS TEXT) AS created_at
       FROM inbox_messages
       WHERE inbox IN (${placeholders})
       ORDER BY created_at ASC
       LIMIT ?`,
    ).all(...inboxes, limit) as Array<{
      id: string;
      inbox: string;
      content: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      inbox: r.inbox,
      content: r.content,
      createdAt: Number(r.created_at),
    }));
  }

  readAfter(inboxes: string[], afterMs: number): InboxMessage[] {
    const placeholders = inboxes.map(() => "?").join(", ");
    const rows = this.db.prepare(
      `SELECT id, inbox, content, CAST(created_at AS TEXT) AS created_at
       FROM inbox_messages
       WHERE inbox IN (${placeholders}) AND created_at > ?
       ORDER BY created_at ASC`,
    ).all(...inboxes, afterMs) as Array<{
      id: string;
      inbox: string;
      content: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      inbox: r.inbox,
      content: r.content,
      createdAt: Number(r.created_at),
    }));
  }

  close(): void {
    this.db.close();
  }
}
