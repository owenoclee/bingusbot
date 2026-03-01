// Package inbox provides a SQLite-backed append-only message store organised
// by named inboxes. Each inbox is a logical stream (e.g. "user", "assistant",
// "tool-calls") and messages are ordered globally by timestamp.

import { Database } from "jsr:@db/sqlite@0.12";
import { generateId, idToMs } from "./utils/id.ts";

export interface InboxMessage {
  id: string;
  inbox: string;
  content: string;
  createdAt: number; // unix ms, derived from id via idToMs()
}

export class InboxStore {
  private db: Database;

  // Called after every append. Assign this to subscribe to inbox writes.
  onChange?: (inbox: string) => void;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inbox_messages (
        id TEXT PRIMARY KEY,
        inbox TEXT NOT NULL,
        content TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_id
        ON inbox_messages (inbox, id ASC);
    `);
  }

  append(inbox: string, content: string): InboxMessage {
    const id = generateId();
    this.db.exec(
      `INSERT INTO inbox_messages (id, inbox, content) VALUES (?, ?, ?)`,
      [id, inbox, content],
    );
    const msg: InboxMessage = { id, inbox, content, createdAt: idToMs(id) };
    this.onChange?.(inbox);
    return msg;
  }

  read(inboxes: string[]): InboxMessage[] {
    const placeholders = inboxes.map(() => "?").join(", ");
    const rows = this.db.prepare(
      `SELECT id, inbox, content
       FROM inbox_messages
       WHERE inbox IN (${placeholders})
       ORDER BY id ASC`,
    ).all(...inboxes) as Array<{ id: string; inbox: string; content: string }>;

    return rows.map((r) => ({
      id: r.id,
      inbox: r.inbox,
      content: r.content,
      createdAt: idToMs(r.id),
    }));
  }

  readAfter(inboxes: string[], afterId: string): InboxMessage[] {
    const placeholders = inboxes.map(() => "?").join(", ");
    const rows = this.db.prepare(
      `SELECT id, inbox, content
       FROM inbox_messages
       WHERE inbox IN (${placeholders}) AND id > ?
       ORDER BY id ASC`,
    ).all(...inboxes, afterId) as Array<{
      id: string;
      inbox: string;
      content: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      inbox: r.inbox,
      content: r.content,
      createdAt: idToMs(r.id),
    }));
  }

  close(): void {
    this.db.close();
  }
}
