import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openCurrentDatabase } from '../storage/current-schema.js';
import { type ContentStoreQuery, contentWhere } from './content-query.js';
import { assertContentSource, type ContentSource } from './content-source.js';
import { assertDouyinIntake } from './douyin/intake.js';
import type { DouyinIntake, DouyinIntakeRecord } from './douyin/intake-contracts.js';
import type {
  ContentAsset,
  ContentAssetIdentity,
  ContentAssetKind,
  ContentAssetPage,
  ContentAssetQuery,
  ContentAssetSortKey,
  ContentCoverState,
  ContentEntry,
  ContentMediaKind,
  ContentOrigin,
  ContentPage,
  ContentSortKey,
  OriginalAvailability,
  OriginalStorage,
} from './library-contracts.js';
import { CONTENT_FILTER_KEYS, CONTENT_QUERY_SORT_DIRECTIONS } from './library-contracts.js';

const MAX_ITEMS = 10000;

export class LibraryStore {
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(filename: string) {
    this.db = openCurrentDatabase(
      filename,
      {
        tables: ['library_items', 'library_links', 'douyin_intake'],
        sql: `
        CREATE TABLE library_items (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, source_path TEXT NOT NULL,
          sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
          media_kind TEXT NOT NULL CHECK(media_kind IN ('video','image','slides','audio','subtitle')),
          duration_ms INTEGER, width INTEGER, height INTEGER, has_audio INTEGER,
          cover_path TEXT,
          cover_state TEXT NOT NULL CHECK(cover_state IN ('ready','pending','unavailable')),
          origin_kind TEXT NOT NULL CHECK(origin_kind IN ('local','douyin')),
          origin_aweme_id TEXT, origin_sec_uid TEXT, origin_share_url TEXT,
          storage TEXT NOT NULL CHECK(storage IN ('reference','copy')),
          availability TEXT NOT NULL DEFAULT 'unchecked', added_at INTEGER NOT NULL,
          published_at INTEGER, updated_at INTEGER NOT NULL, removed_at INTEGER
        ) STRICT;
        CREATE INDEX library_content ON library_items(sha256, removed_at);
        CREATE TABLE library_links (
          id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES library_items(id),
          kind TEXT NOT NULL CHECK(kind IN ('project','subtitle','export','audio')),
          name TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
          created_at INTEGER NOT NULL, UNIQUE(item_id, kind, path, sha256)
        ) STRICT;
        CREATE TABLE douyin_intake (
          item_id TEXT PRIMARY KEY REFERENCES library_items(id),
          aweme_id TEXT NOT NULL, projection TEXT NOT NULL CHECK(json_valid(projection)),
          raw TEXT NOT NULL CHECK(json_valid(raw))
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

  private decode(row: Record<string, unknown>): ContentEntry {
    const item: ContentEntry = {
      id: String(row.id),
      name: String(row.name),
      path: String(row.source_path),
      sha256: String(row.sha256),
      size_bytes: Number(row.size_bytes),
      media_kind: row.media_kind as ContentMediaKind,
      video:
        row.media_kind === 'video'
          ? {
              duration_ms: Number(row.duration_ms),
              width: Number(row.width),
              height: Number(row.height),
              has_audio: row.has_audio === 1,
            }
          : null,
      audio: row.media_kind === 'audio' ? { duration_ms: Number(row.duration_ms) } : null,
      cover_path: row.cover_path === null ? null : String(row.cover_path),
      cover_state: row.cover_state as ContentCoverState,
      origin:
        row.origin_kind === 'douyin'
          ? {
              kind: 'douyin',
              aweme_id: String(row.origin_aweme_id),
              sec_uid: row.origin_sec_uid === null ? null : String(row.origin_sec_uid),
              share_url: row.origin_share_url === null ? null : String(row.origin_share_url),
            }
          : { kind: 'local' },
      storage: row.storage as OriginalStorage,
      availability: row.availability as OriginalAvailability,
      added_at: Number(row.added_at),
      published_at: row.published_at === null ? null : Number(row.published_at),
      updated_at: Number(row.updated_at),
      links: this.db
        .prepare(
          'SELECT id,kind,name,path,sha256,size_bytes,created_at FROM library_links WHERE item_id=? ORDER BY created_at DESC',
        )
        .all(String(row.id)) as unknown as ContentAsset[],
    };
    return item;
  }

  getContent(id: string): ContentEntry {
    const row = this.db
      .prepare('SELECT * FROM library_items WHERE id=? AND removed_at IS NULL')
      .get(id);
    if (!row) throw new Error('LIBRARY_ITEM_MISSING');
    return this.decode(row);
  }

  findContent(sha256: string): ContentEntry | null {
    const row = this.db
      .prepare(
        'SELECT * FROM library_items WHERE sha256=? AND removed_at IS NULL ORDER BY added_at LIMIT 1',
      )
      .get(sha256);
    return row ? this.decode(row) : null;
  }

  findContentByAwemeId(awemeId: string): ContentEntry | null {
    if (typeof awemeId !== 'string' || awemeId.length === 0 || awemeId.length > 64) return null;
    const row = this.db
      .prepare(
        "SELECT * FROM library_items WHERE origin_kind='douyin' AND origin_aweme_id=? AND removed_at IS NULL ORDER BY added_at LIMIT 1",
      )
      .get(awemeId);
    return row ? this.decode(row) : null;
  }

  saveDouyinIntake(contentId: string, intake: DouyinIntake, raw: unknown): void {
    assertDouyinIntake(intake);
    const content = this.getContent(contentId);
    if (content.origin.kind !== 'douyin' || content.origin.aweme_id !== intake.awemeId)
      throw new Error('INVALID_REQUEST');
    let encodedRaw: string | undefined;
    try {
      encodedRaw = JSON.stringify(raw);
    } catch {
      throw new Error('INVALID_REQUEST');
    }
    if (encodedRaw === undefined) throw new Error('INVALID_REQUEST');
    this.db
      .prepare(
        `INSERT INTO douyin_intake (item_id,aweme_id,projection,raw) VALUES (?,?,?,?)
        ON CONFLICT(item_id) DO UPDATE SET aweme_id=excluded.aweme_id,
        projection=excluded.projection, raw=excluded.raw`,
      )
      .run(contentId, intake.awemeId, JSON.stringify(intake), encodedRaw);
  }

  getDouyinIntake(contentId: string): DouyinIntakeRecord | null {
    const row = this.db
      .prepare('SELECT projection, raw FROM douyin_intake WHERE item_id=?')
      .get(contentId);
    if (!row) return null;
    return {
      intake: JSON.parse(String(row.projection)) as DouyinIntake,
      raw: JSON.parse(String(row.raw)),
    };
  }

  // An empty contentIds array is a real empty result.
  listContent(query: ContentStoreQuery, contentIds?: readonly string[]): ContentPage {
    // sort_by reaches SQL only through this exact column lookup, never interpolated.
    const sortColumns: Record<ContentSortKey, string> = {
      name: 'name',
      duration_ms: 'duration_ms',
      availability: 'availability',
      added_at: 'added_at',
      published_at: 'published_at',
    };
    const allowedKeys = [
      'search',
      'offset',
      'limit',
      'sort_by',
      'sort_dir',
      ...CONTENT_FILTER_KEYS.filter((key) => key !== 'label_ids'),
    ];
    if (
      !query ||
      Array.isArray(query) ||
      Object.keys(query).some((key) => !allowedKeys.includes(key)) ||
      typeof query.search !== 'string' ||
      query.search.length > 256 ||
      !Number.isInteger(query.offset) ||
      query.offset < 0 ||
      query.offset > MAX_ITEMS ||
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.sort_by !== undefined && !Object.hasOwn(sortColumns, query.sort_by)) ||
      (query.sort_dir !== undefined && !CONTENT_QUERY_SORT_DIRECTIONS.includes(query.sort_dir))
    ) {
      throw new Error('INVALID_REQUEST');
    }
    const { where, values } = contentWhere(query, contentIds);
    const total = Number(
      this.db.prepare(`SELECT COUNT(*) AS count FROM library_items WHERE ${where}`).get(...values)
        ?.count,
    );
    const orderBy = query.sort_by
      ? `${sortColumns[query.sort_by]} ${query.sort_dir === 'descending' ? 'DESC' : 'ASC'}, rowid DESC`
      : 'added_at DESC, rowid DESC';
    const rows = this.db
      .prepare(`SELECT * FROM library_items WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...values, query.limit, query.offset);
    return {
      items: rows.map((row) => this.decode(row)),
      total,
      offset: query.offset,
      limit: query.limit,
    };
  }

  addContent(id: string, source: ContentSource, storage: OriginalStorage): ContentEntry {
    assertContentSource(source);
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(id) || !['reference', 'copy'].includes(storage)) {
      throw new Error('INVALID_REQUEST');
    }
    const count = Number(
      this.db.prepare('SELECT COUNT(*) AS count FROM library_items').get()?.count,
    );
    if (count >= MAX_ITEMS) throw new Error('LIBRARY_LIMIT');
    const origin: ContentOrigin = source.origin ?? { kind: 'local' };
    const now = Date.now();
    this.db
      .prepare(`INSERT INTO library_items
      (id,name,source_path,sha256,size_bytes,media_kind,duration_ms,width,height,has_audio,
       cover_path,cover_state,origin_kind,origin_aweme_id,origin_sec_uid,origin_share_url,
       storage,availability,added_at,published_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,NULL,'pending',?,?,?,?,?,'available',?,?,?)`)
      .run(
        id,
        source.name,
        source.path,
        source.sha256,
        source.size_bytes,
        source.media_kind,
        source.video?.duration_ms ?? source.audio?.duration_ms ?? null,
        source.video?.width ?? null,
        source.video?.height ?? null,
        source.video === null ? null : Number(source.video.has_audio),
        origin.kind,
        origin.kind === 'douyin' ? origin.aweme_id : null,
        origin.kind === 'douyin' ? origin.sec_uid : null,
        origin.kind === 'douyin' ? origin.share_url : null,
        storage,
        now,
        source.published_at ?? null,
        now,
      );
    return this.getContent(id);
  }

  setCover(
    id: string,
    cover: { path: string; state: 'ready' } | { state: 'unavailable' },
  ): ContentEntry {
    this.getContent(id);
    this.db
      .prepare('UPDATE library_items SET cover_path=?,cover_state=?,updated_at=? WHERE id=?')
      .run('path' in cover ? cover.path : null, cover.state, Date.now(), id);
    return this.getContent(id);
  }

  relinkOriginal(id: string, source: ContentSource): ContentEntry {
    assertContentSource(source);
    const item = this.getContent(id);
    if (source.sha256 !== item.sha256) throw new Error('SOURCE_CHANGED');
    this.db
      .prepare(
        "UPDATE library_items SET source_path=?,storage='reference',availability='available',updated_at=? WHERE id=?",
      )
      .run(source.path, Date.now(), id);
    return this.getContent(id);
  }

  setAvailability(id: string, state: OriginalAvailability): void {
    if (!['unchecked', 'available', 'missing', 'changed'].includes(state))
      throw new Error('INVALID_REQUEST');
    this.db
      .prepare(
        'UPDATE library_items SET availability=?,updated_at=? WHERE id=? AND removed_at IS NULL',
      )
      .run(state, Date.now(), id);
  }

  addAsset(
    id: string,
    kind: ContentAssetKind,
    filename: string,
    file: ContentAssetIdentity,
  ): ContentAsset {
    this.getContent(id);
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
    const link = this.getContent(id).links.find(
      (candidate) =>
        candidate.kind === kind && candidate.path === filename && candidate.sha256 === file.sha256,
    );
    if (!link) throw new Error('INVALID_STATE');
    return link;
  }

  listAssets(query: ContentAssetQuery): ContentAssetPage {
    const sortColumns: Record<ContentAssetSortKey, string> = {
      name: 'l.name',
      kind: 'l.kind',
      content_name: 'i.name',
      created_at: 'l.created_at',
    };
    if (
      !query ||
      Array.isArray(query) ||
      Object.keys(query).some(
        (key) =>
          !['kind', 'search', 'offset', 'limit', 'item_id', 'sort_by', 'sort_dir'].includes(key),
      ) ||
      !['all', 'project', 'subtitle', 'export', 'audio'].includes(query.kind) ||
      typeof query.search !== 'string' ||
      query.search.length > 256 ||
      !Number.isSafeInteger(query.offset) ||
      query.offset < 0 ||
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.sort_by !== undefined && !Object.hasOwn(sortColumns, query.sort_by)) ||
      (query.sort_dir !== undefined && !CONTENT_QUERY_SORT_DIRECTIONS.includes(query.sort_dir))
    )
      throw new Error('INVALID_REQUEST');
    if (query.item_id !== undefined) {
      if (typeof query.item_id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(query.item_id))
        throw new Error('INVALID_REQUEST');
      this.getContent(query.item_id);
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
    const orderBy = query.sort_by
      ? `${sortColumns[query.sort_by]} ${query.sort_dir === 'descending' ? 'DESC' : 'ASC'}, l.rowid DESC`
      : 'l.created_at DESC, l.rowid DESC';
    const items = this.db
      .prepare(`SELECT l.*,i.name AS content_name FROM library_links l
      JOIN library_items i ON i.id=l.item_id WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...values, query.limit, query.offset) as unknown as ContentAssetPage['items'];
    return { items, total, offset: query.offset, limit: query.limit };
  }

  removeContent(id: string): void {
    this.getContent(id);
    this.db
      .prepare('UPDATE library_items SET removed_at=?,updated_at=? WHERE id=?')
      .run(Date.now(), Date.now(), id);
  }

  exportChoices(): { library_id: string; export_id: string; content_name: string; name: string }[] {
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
