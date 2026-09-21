import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../storage/current-schema.js';
import { RemoteError } from '../worker/remote-error.js';

export interface DouyinChannel {
  secUid: string;
  nickname: string | null;
  /** Epoch ms of the last search that returned this channel. */
  lastScannedAt: number;
}

// Keyed on durable sec_uid; a nickname changes and collides.
export class DouyinChannelStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(filename: string) {
    this.db = openCurrentDatabase(
      filename,
      {
        tables: ['douyin_channel'],
        sql: `
        CREATE TABLE douyin_channel (
          sec_uid TEXT PRIMARY KEY, nickname TEXT, last_scanned_at INTEGER NOT NULL
        ) STRICT;
      `,
      },
      new RemoteError('DOUYIN_CHANNEL_VERSION'),
    );
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }

  list(): DouyinChannel[] {
    return this.db
      .prepare(
        'SELECT sec_uid, nickname, last_scanned_at FROM douyin_channel ORDER BY last_scanned_at DESC',
      )
      .all()
      .map((row) => ({
        secUid: String(row.sec_uid),
        nickname: row.nickname === null ? null : String(row.nickname),
        lastScannedAt: Number(row.last_scanned_at),
      }));
  }

  save(channel: { secUid: string; nickname: string | null }, at: number): void {
    this.db
      .prepare(
        `INSERT INTO douyin_channel (sec_uid, nickname, last_scanned_at) VALUES (?, ?, ?)
         ON CONFLICT(sec_uid) DO UPDATE SET nickname = excluded.nickname,
           last_scanned_at = excluded.last_scanned_at`,
      )
      .run(channel.secUid, channel.nickname, at);
  }
}
