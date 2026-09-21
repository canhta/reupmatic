export type OriginalStorage = 'reference' | 'copy';

/**
 * What a content item actually is. Image posts and slides are not videos, a soundtrack is not a
 * video and a subtitle file is neither, and storing one in a video-shaped record is corruption
 * that only surfaces much later, in the Editor. So the kind is explicit and each kind's probed
 * facts hang off it rather than sitting on every record.
 *
 * `audio` and `subtitle` are reachable through local import; `image`/`slides` arrive from a
 * connector. Duration is the one fact video and audio share, and each keeps it under its own
 * variant so a consumer never has to guess which kind a bare number belongs to.
 */
export type ContentMediaKind = 'video' | 'image' | 'slides' | 'audio' | 'subtitle';

/** Probed facts that exist only for a video. Non-null exactly when `media_kind` is `'video'`. */
export interface ContentVideoFacts {
  duration_ms: number;
  width: number;
  height: number;
  has_audio: boolean;
}

/** Probed facts that exist only for an audio item. Non-null exactly when `media_kind` is `'audio'`. */
export interface ContentAudioFacts {
  duration_ms: number;
}

/**
 * Where an item came from. Per-source facts live inside the variant, never as nullable columns on
 * the shared shape — the Library mixes local imports, Douyin and later RedNote, and a record
 * shaped around one connector is one the next connector fills with nulls.
 *
 * The test of this seam: adding a third origin should mean adding one variant and one adapter,
 * with no list or query code touched.
 */
export interface ContentOriginLocal {
  kind: 'local';
}

export interface ContentOriginDouyin {
  kind: 'douyin';
  aweme_id: string;
  /** The durable channel identity. Nicknames change and collide; this does not. */
  sec_uid: string | null;
  share_url: string | null;
}

export type ContentOrigin = ContentOriginLocal | ContentOriginDouyin;

export const CONTENT_ORIGIN_KINDS = ['local', 'douyin'] as const;
export type ContentOriginKind = (typeof CONTENT_ORIGIN_KINDS)[number];

export const CONTENT_MEDIA_KINDS = ['video', 'image', 'slides', 'audio', 'subtitle'] as const;
export const CONTENT_AVAILABILITY_STATES = [
  'unchecked',
  'available',
  'missing',
  'changed',
] as const;

/**
 * A cover is always a local file: downloaded and materialized at intake for a connector, an
 * FFmpeg poster frame for a local import, and indistinguishable to every consumer afterwards.
 * A remote URL is never stored — connector cover URLs expire.
 *
 * `pending` and `unavailable` are designed states, not an absent path to paper over: a Library
 * row renders a real placeholder for them (UI-CM06).
 */
export type ContentCoverState = 'ready' | 'pending' | 'unavailable';
export type OriginalAvailability = 'unchecked' | 'available' | 'missing' | 'changed';

/**
 * The media-registry id a Library cover is registered under, and the URL the renderer reads it
 * back from. Producer (`app/electron/features/library/ipc.ts`) and consumer (`LibraryCover.tsx`)
 * share these so the two sides of the `media:` boundary cannot drift (one current contract per
 * boundary). The renderer CSP forbids `file://`, so a cover is never rendered from
 * `cover_path` directly.
 */
export function libraryCoverAssetId(contentId: string): string {
  return `cover-${contentId}`;
}

export function libraryCoverUrl(contentId: string): string {
  return `media://local/${libraryCoverAssetId(contentId)}`;
}
export type ContentAssetKind = 'project' | 'subtitle' | 'export' | 'audio';

export interface ContentAssetIdentity {
  sha256: string;
  size_bytes: number;
}

export interface ContentAsset extends ContentAssetIdentity {
  id: string;
  kind: ContentAssetKind;
  name: string;
  path: string;
  created_at: number;
}

/**
 * The duration a row can show, whichever kind holds it. `null` when the kind has none — an image,
 * a slide or a subtitle — which callers render as a gap, never as zero.
 */
export function contentDurationMs(item: Pick<ContentEntry, 'video' | 'audio'>): number | null {
  return item.video?.duration_ms ?? item.audio?.duration_ms ?? null;
}

export interface ContentEntry {
  id: string;
  name: string;
  path: string;
  sha256: string;
  /** The probed original's size on disk. Universal: every source has a file. */
  size_bytes: number;
  media_kind: ContentMediaKind;
  /** Non-null exactly when `media_kind` is `'video'`; a non-video entry cannot carry zeroed
   * duration/width/height instead. */
  video: ContentVideoFacts | null;
  /** Non-null exactly when `media_kind` is `'audio'`. An audio item's duration lives here, never
   * in the video variant. */
  audio: ContentAudioFacts | null;
  cover_path: string | null;
  cover_state: ContentCoverState;
  origin: ContentOrigin;
  storage: OriginalStorage;
  availability: OriginalAvailability;
  /** When this item entered the Library. Every item has one. */
  added_at: number;
  /** When the source originally published it. Connector items have one; a local import does not,
   * and its file mtime is not a publish date. Never collapsed with `added_at` under "date". */
  published_at: number | null;
  updated_at: number;
  links: ContentAsset[];
}

// Single source of truth for a library query's sort keys/directions: the derived types below
// feed the query interfaces, host-bridge validation (host-bridge/operations/library.ts) and the
// store's column map (library-store.ts), so the three stay in sync at compile time.
export const CONTENT_SORT_KEYS = [
  'name',
  'duration_ms',
  'availability',
  'added_at',
  'published_at',
] as const;
export type ContentSortKey = (typeof CONTENT_SORT_KEYS)[number];
export const CONTENT_QUERY_SORT_DIRECTIONS = ['ascending', 'descending'] as const;
export type ContentQuerySortDirection = (typeof CONTENT_QUERY_SORT_DIRECTIONS)[number];

/** An inclusive numeric range. Both bounds are optional; omitted means unbounded. */
export interface ContentNumericRange {
  min?: number;
  max?: number;
}

/** Dependent assets a content row can be filtered by (SL-R05); `audio` is not a filter here. */
export const CONTENT_LINKED_ASSET_KINDS = ['project', 'subtitle', 'export'] as const;
export type ContentLinkedAssetKind = (typeof CONTENT_LINKED_ASSET_KINDS)[number];

export const CONTENT_FILTER_KEYS = [
  'media_kinds',
  'origins',
  'availability',
  'duration_ms',
  'resolution',
  'size_bytes',
  'added_at',
  'published_at',
  'label_ids',
  'linked',
] as const;

/**
 * Filters are one query, not a sequence of narrowing passes: `total` describes the same
 * matching set the page is sliced from.
 *
 * The rule that keeps a mixed Library honest — filtering on a facet a row lacks excludes
 * nothing. `duration_ms` applies to the kinds that carry one (video and audio); `resolution` only
 * to video; a local import with no `published_at` is never dropped by that range. A row with no
 * duration/resolution is kept, and treating that absence as zero would silently hide every image
 * and slide.
 */
export interface ContentQuery {
  search: string;
  offset: number;
  limit: number;
  /** Omitted: newest first (`added_at` desc), the storage's own default order. */
  sort_by?: ContentSortKey;
  sort_dir?: ContentQuerySortDirection;
  /** Empty or omitted: every kind. */
  media_kinds?: ContentMediaKind[];
  /** Empty or omitted: every origin. */
  origins?: ContentOriginKind[];
  /** Empty or omitted: every availability. */
  availability?: OriginalAvailability[];
  /** Video/audio duration in milliseconds. Rows of kinds without a duration are never excluded. */
  duration_ms?: ContentNumericRange;
  /** Video short edge in pixels (orientation-independent). Non-video rows are never excluded. */
  resolution?: ContentNumericRange;
  size_bytes?: ContentNumericRange;
  added_at?: ContentNumericRange;
  /** Connector publish time. Rows without one are never excluded. */
  published_at?: ContentNumericRange;
  /** Matches any row carrying at least one of these labels. Empty or omitted: every row. */
  label_ids?: string[];
  /** Matches rows with at least one dependent asset of these kinds. Empty or omitted: every row. */
  linked?: ContentLinkedAssetKind[];
}

export interface ContentPage {
  items: ContentEntry[];
  total: number;
  offset: number;
  limit: number;
}

export interface OriginalImportOptions {
  mode: OriginalStorage;
  duplicates: 'reuse' | 'separate';
}

export interface OriginalImportResult {
  items: { item: ContentEntry; reused: boolean }[];
  rejected: { name: string; code: string }[];
  cancelled: boolean;
}

export interface OriginalImportProgress {
  completed: number;
  total: number;
  name: string;
  phase: 'importing' | 'complete' | 'cancelled';
}

export interface ContentDependencies {
  posts: number;
  pending_posts: number;
  workflows: number;
  item: ContentEntry;
  pending_jobs: number;
  known_links_only: true;
}

export const CONTENT_ASSET_SORT_KEYS = ['name', 'kind', 'content_name', 'created_at'] as const;
export type ContentAssetSortKey = (typeof CONTENT_ASSET_SORT_KEYS)[number];
export interface ContentAssetQuery
  extends Omit<ContentQuery, 'sort_by' | (typeof CONTENT_FILTER_KEYS)[number]> {
  kind: ContentAssetKind | 'all';
  item_id?: string;
  /** Omitted: newest first (`added_at` desc), the storage's own default order. */
  sort_by?: ContentAssetSortKey;
}

export interface ContentAssetView extends ContentAsset {
  item_id: string;
  content_name: string;
}

export interface ContentAssetPage extends Omit<ContentPage, 'items'> {
  items: ContentAssetView[];
}

export type ContentAssetPreview =
  | { kind: 'export' | 'audio'; name: string; url: string; duration_ms: number }
  | { kind: 'subtitle'; name: string; cues: import('../subtitles/cues.js').Cue[] };
