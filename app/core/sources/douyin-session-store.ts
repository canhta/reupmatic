import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../storage/current-schema.js';
import { RemoteError } from '../worker/remote-error.js';

export interface DouyinSessionState {
  everConnected: boolean;
  connectedAt: number | null;
}

const ROW_ID = 'douyin';

// An expired session reads back as needs_reconnect, not not_connected.
export class DouyinSessionStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(filename: string) {
    this.db = openCurrentDatabase(
      filename,
      {
        tables: ['douyin_session'],
        sql: `
        CREATE TABLE douyin_session (
          id TEXT PRIMARY KEY, ever_connected INTEGER NOT NULL DEFAULT 0, connected_at INTEGER
        ) STRICT;
      `,
      },
      new RemoteError('DOUYIN_SESSION_VERSION'),
    );
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }

  read(): DouyinSessionState {
    const row = this.db
      .prepare('SELECT ever_connected, connected_at FROM douyin_session WHERE id = ?')
      .get(ROW_ID) as { ever_connected: number; connected_at: number | null } | undefined;
    return row
      ? { everConnected: row.ever_connected === 1, connectedAt: row.connected_at }
      : { everConnected: false, connectedAt: null };
  }

  markConnected(at: number): DouyinSessionState {
    this.db
      .prepare(
        `INSERT INTO douyin_session (id, ever_connected, connected_at) VALUES (?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET ever_connected = 1, connected_at = excluded.connected_at`,
      )
      .run(ROW_ID, at);
    return { everConnected: true, connectedAt: at };
  }

  markDisconnected(): DouyinSessionState {
    this.db
      .prepare(
        `INSERT INTO douyin_session (id, ever_connected, connected_at) VALUES (?, 0, NULL)
         ON CONFLICT(id) DO UPDATE SET ever_connected = 0, connected_at = NULL`,
      )
      .run(ROW_ID);
    return { everConnected: false, connectedAt: null };
  }
}
