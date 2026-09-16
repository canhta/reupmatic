import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { VideoSource } from '../media/media-types.js';
import { openCurrentDatabase } from '../storage/current-schema.js';
import type {
  LibraryAssetPage,
  LibraryAssetQuery,
  LibraryAvailability,
  LibraryFileIdentity,
  LibraryItem,
  LibraryLink,
  LibraryLinkKind,
  LibraryPage,
  LibraryQuery,
  LibraryStorage,
} from './library-types.js';

const MAX_ITEMS = 10000;

function assertSource(source: VideoSource): void {
  if (
    !source ||
    !path.isAbsolute(source.path) ||
    source.path.includes('\0') ||
    !source.name ||
    source.name.length > 1024 ||
    !/^[a-f0-9]{64}$/.test(source.sha256) ||
    !Number.isInteger(source.duration_ms) ||
    source.duration_ms <= 0 ||
    !Number.isInteger(source.width) ||
    source.width <= 0 ||
    !Number.isInteger(source.height) ||
    source.height <= 0 ||
    typeof source.has_audio !== 'boolean'
  )
    throw new Error('INVALID_MEDIA');
}

export class LibraryStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(filename: string) {
    this.db = openCurrentDatabase(
      filename,
      {
        version: 2,
        tables: ['library_items', 'library_links'],
        sql: `
        CREATE TABLE library_items (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, source_path TEXT NOT NULL,
          sha256 TEXT NOT NULL, duration_ms INTEGER NOT NULL, width INTEGER NOT NULL,
          height INTEGER NOT NULL, has_audio INTEGER NOT NULL,
          storage TEXT NOT NULL CHECK(storage IN ('reference','copy')),
          availability TEXT NOT NULL DEFAULT 'unchecked', created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL, removed_at INTEGER
        ) STRICT;
        CREATE INDEX library_content ON library_items(sha256, removed_at);
        CREATE TABLE library_links (
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES library_items(id),
          kind TEXT NOT NULL CHECK(kind IN ('project','subtitle','export','audio')),
          name TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
          created_at INTEGER NOT NULL, UNIQUE(item_id, kind, path, sha256)
        ) STRICT;
      `,
      },
      new Error('LIBRARY_VERSION'),
    );
    try {
      this.db.exec("UPDATE library_items SET availability='unchecked' WHERE removed_at IS NULL");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private decode(row: Record<string, unknown>): LibraryItem {
    const item: LibraryItem = {
      id: String(row.id),
      name: String(row.name),
      path: String(row.source_path),
      sha256: String(row.sha256),
      duration_ms: Number(row.duration_ms),
      width: Number(row.width),
      height: Number(row.height),
      has_audio: row.has_audio === 1,
      storage: row.storage as LibraryStorage,
      availability: row.availability as LibraryAvailability,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      links: this.db
        .prepare(
          'SELECT id,kind,name,path,sha256,size_bytes,created_at FROM library_links WHERE item_id=? ORDER BY created_at DESC',
        )
        .all(String(row.id)) as unknown as LibraryLink[],
    };
    assertSource(item);
    return item;
  }

  get(id: string): LibraryItem {
    const row = this.db
      .prepare('SELECT * FROM library_items WHERE id=? AND removed_at IS NULL')
      .get(id);
    if (!row) throw new Error('LIBRARY_ITEM_MISSING');
    return this.decode(row);
  }

  findContent(sha256: string): LibraryItem | null {
    const row = this.db
      .prepare(
        'SELECT * FROM library_items WHERE sha256=? AND removed_at IS NULL ORDER BY created_at LIMIT 1',
      )
      .get(sha256);
    return row ? this.decode(row) : null;
  }

  list(query: LibraryQuery): LibraryPage {
    if (
      !query ||
      typeof query.search !== 'string' ||
      query.search.length > 256 ||
      !Number.isInteger(query.offset) ||
      query.offset < 0 ||
      query.offset > MAX_ITEMS ||
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100
    ) {
      throw new Error('INVALID_REQUEST');
    }
    const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = "removed_at IS NULL AND name LIKE ? ESCAPE '\\'";
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) AS count FROM library_items WHERE ${where}`).get(search)
        ?.count,
    );
    const rows = this.db
      .prepare(
        `SELECT * FROM library_items WHERE ${where} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
      )
      .all(search, query.limit, query.offset);
    return {
      items: rows.map((row) => this.decode(row)),
      total,
      offset: query.offset,
      limit: query.limit,
    };
  }

  add(id: string, source: VideoSource, storage: LibraryStorage): LibraryItem {
    assertSource(source);
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id) || !['reference', 'copy'].includes(storage)) {
      throw new Error('INVALID_REQUEST');
    }
    const count = Number(
      this.db.prepare('SELECT COUNT(*) AS count FROM library_items').get()?.count,
    );
    if (count >= MAX_ITEMS) throw new Error('LIBRARY_LIMIT');
    const now = Date.now();
    this.db
      .prepare(`INSERT INTO library_items
      (id,name,source_path,sha256,duration_ms,width,height,has_audio,storage,availability,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'available',?,?)`)
      .run(
        id,
        source.name,
        source.path,
        source.sha256,
        source.duration_ms,
        source.width,
        source.height,
        Number(source.has_audio),
        storage,
        now,
        now,
      );
    return this.get(id);
  }

  relocate(id: string, source: VideoSource): LibraryItem {
    assertSource(source);
    const item = this.get(id);
    if (source.sha256 !== item.sha256) throw new Error('SOURCE_CHANGED');
    this.db
      .prepare(
        "UPDATE library_items SET source_path=?,storage='reference',availability='available',updated_at=? WHERE id=?",
      )
      .run(source.path, Date.now(), id);
    return this.get(id);
  }

  availability(id: string, state: LibraryAvailability): void {
    if (!['unchecked', 'available', 'missing', 'changed'].includes(state))
      throw new Error('INVALID_REQUEST');
    this.db
      .prepare(
        'UPDATE library_items SET availability=?,updated_at=? WHERE id=? AND removed_at IS NULL',
      )
      .run(state, Date.now(), id);
  }

  link(
    id: string,
    kind: LibraryLinkKind,
    filename: string,
    file: LibraryFileIdentity,
  ): LibraryLink {
    this.get(id);
    if (
      !['project', 'subtitle', 'export', 'audio'].includes(kind) ||
      !path.isAbsolute(filename) ||
      filename.includes('\0') ||
      !file ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.size_bytes) ||
      file.size_bytes < 0
    )
      throw new Error('INVALID_REQUEST');
    this.db
      .prepare(`INSERT INTO library_links (id,item_id,kind,name,path,sha256,size_bytes,created_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(item_id,kind,path,sha256) DO NOTHING`)
      .run(
        randomUUID(),
        id,
        kind,
        path.basename(filename),
        filename,
        file.sha256,
        file.size_bytes,
        Date.now(),
      );
    const link = this.get(id).links.find(
      (candidate) =>
        candidate.kind === kind && candidate.path === filename && candidate.sha256 === file.sha256,
    );
    if (!link) throw new Error('INVALID_STATE');
    return link;
  }

  assets(query: LibraryAssetQuery): LibraryAssetPage {
    if (
      !query ||
      Array.isArray(query) ||
      Object.keys(query).some(
        (key) => !['kind', 'search', 'offset', 'limit', 'item_id'].includes(key),
      ) ||
      !['all', 'project', 'subtitle', 'export', 'audio'].includes(query.kind) ||
      typeof query.search !== 'string' ||
      query.search.length > 256 ||
      !Number.isSafeInteger(query.offset) ||
      query.offset < 0 ||
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100
    )
      throw new Error('INVALID_REQUEST');
    if (query.item_id !== undefined) {
      if (typeof query.item_id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(query.item_id))
        throw new Error('INVALID_REQUEST');
      this.get(query.item_id);
    }
    const term = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    const where = `i.removed_at IS NULL AND (?='all' OR l.kind=?) AND (?='' OR l.item_id=?)
      AND (l.name LIKE ? ESCAPE '\\' OR i.name LIKE ? ESCAPE '\\')`;
    const values = [query.kind, query.kind, query.item_id ?? '', query.item_id ?? '', term, term];
    const total = Number(
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM library_links l
      JOIN library_items i ON i.id=l.item_id WHERE ${where}`)
        .get(...values)?.n,
    );
    const items = this.db
      .prepare(`SELECT l.*,i.name AS content_name FROM library_links l
      JOIN library_items i ON i.id=l.item_id WHERE ${where} ORDER BY l.created_at DESC,l.rowid DESC LIMIT ? OFFSET ?`)
      .all(...values, query.limit, query.offset) as unknown as LibraryAssetPage['items'];
    return { items, total, offset: query.offset, limit: query.limit };
  }

  forget(id: string): void {
    this.get(id);
    this.db
      .prepare('UPDATE library_items SET removed_at=?,updated_at=? WHERE id=?')
      .run(Date.now(), Date.now(), id);
  }

  exports(): { library_id: string; export_id: string; content_name: string; name: string }[] {
    return this.db
      .prepare(`SELECT i.id AS library_id,l.id AS export_id,i.name AS content_name,l.name
      FROM library_links l JOIN library_items i ON i.id=l.item_id
      WHERE l.kind='export' AND i.removed_at IS NULL ORDER BY l.created_at DESC LIMIT 2000`)
      .all() as unknown as {
      library_id: string;
      export_id: string;
      content_name: string;
      name: string;
    }[];
  }

  protectedPaths(): string[] {
    return this.db
      .prepare(
        "SELECT source_path FROM library_items UNION SELECT path AS source_path FROM library_links WHERE kind='audio'",
      )
      .all()
      .map((row) => String(row.source_path));
  }
}
