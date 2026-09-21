import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../storage/current-schema.js';
import type { CatalogKind, RecordMeta } from './catalog-contracts.js';
import { identifier, revision } from './validation.js';

const MAX_RECORDS_PER_KIND = 2000;

export class CatalogDatabase {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(filename: string) {
    this.db = openCurrentDatabase(
      filename,
      {
        tables: ['catalog_records', 'catalog_state'],
        sql: `
        CREATE TABLE catalog_records (
          kind TEXT NOT NULL CHECK(kind IN ('label','content_labels','channel','affiliate','profile','post','workflow','run')),
          id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
          body TEXT NOT NULL CHECK(json_valid(body)), created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, PRIMARY KEY(kind,id)
        ) STRICT;
        CREATE TABLE catalog_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL) STRICT;
        INSERT INTO catalog_state VALUES (1,0);
      `,
      },
      new Error('CATALOG_VERSION'),
    );
  }

  get version(): number {
    return Number(this.db.prepare('SELECT revision FROM catalog_state WHERE id=1').get()?.revision);
  }

  private decode<T extends object>(row: Record<string, unknown>): T & RecordMeta {
    const body: unknown = JSON.parse(String(row.body));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('CATALOG_INVALID');
    return {
      ...body,
      id: String(row.id),
      revision: Number(row.revision),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
    } as T & RecordMeta;
  }

  find<T extends object>(kind: CatalogKind, id: string): (T & RecordMeta) | null {
    const row = this.db
      .prepare('SELECT * FROM catalog_records WHERE kind=? AND id=?')
      .get(kind, identifier(id));
    return row ? this.decode<T>(row) : null;
  }

  require<T extends object>(kind: CatalogKind, id: string): T & RecordMeta {
    const value = this.find<T>(kind, id);
    if (!value) throw new Error('CATALOG_ITEM_MISSING');
    return value;
  }

  list<T extends object>(kind: CatalogKind): (T & RecordMeta)[] {
    return this.db
      .prepare('SELECT * FROM catalog_records WHERE kind=? ORDER BY updated_at DESC,id')
      .all(kind)
      .map((row) => this.decode<T>(row));
  }

  save<T extends object>(
    kind: CatalogKind,
    id: string,
    expected: number | null,
    body: T,
  ): T & RecordMeta {
    identifier(id);
    revision(expected);
    if (['id', 'revision', 'created_at', 'updated_at'].some((key) => Object.hasOwn(body, key))) {
      throw new Error('INVALID_REQUEST');
    }
    const encoded = JSON.stringify(body);
    if (Buffer.byteLength(encoded) > 4 * 1024 * 1024) throw new Error('CATALOG_LIMIT');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.find<T>(kind, id);
      if ((previous?.revision ?? null) !== expected) throw new Error('REVISION_CONFLICT');
      if (
        !previous &&
        Number(
          this.db.prepare('SELECT COUNT(*) AS n FROM catalog_records WHERE kind=?').get(kind)?.n,
        ) >= MAX_RECORDS_PER_KIND
      )
        throw new Error('CATALOG_LIMIT');
      const now = Date.now();
      this.db
        .prepare(`INSERT INTO catalog_records VALUES (?,?,?,?,?,?)
        ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,body=excluded.body,updated_at=excluded.updated_at`)
        .run(kind, id, (expected ?? 0) + 1, encoded, previous?.created_at ?? now, now);
      this.db.exec('UPDATE catalog_state SET revision=revision+1 WHERE id=1');
      const result = this.require<T>(kind, id);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
