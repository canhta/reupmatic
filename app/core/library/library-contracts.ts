export type OriginalStorage = 'reference' | 'copy';

export type ContentMediaKind = 'video' | 'image' | 'slides' | 'audio' | 'subtitle';

export interface ContentVideoFacts {
  duration_ms: number;
  width: number;
  height: number;
  has_audio: boolean;
}

export interface ContentAudioFacts {
  duration_ms: number;
}

export interface ContentOriginLocal {
  kind: 'local';
}

export interface ContentOriginDouyin {
  kind: 'douyin';
  aweme_id: string;
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

// Covers are local files; connector URLs expire and are never stored.
export type ContentCoverState = 'ready' | 'pending' | 'unavailable';
export type OriginalAvailability = 'unchecked' | 'available' | 'missing' | 'changed';

// Shared so the media: boundary cannot drift; renderer CSP forbids file://.
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

export function contentDurationMs(item: Pick<ContentEntry, 'video' | 'audio'>): number | null {
  return item.video?.duration_ms ?? item.audio?.duration_ms ?? null;
}

export interface ContentEntry {
  id: string;
  name: string;
  path: string;
  sha256: string;
  size_bytes: number;
  media_kind: ContentMediaKind;
  video: ContentVideoFacts | null;
  audio: ContentAudioFacts | null;
  cover_path: string | null;
  cover_state: ContentCoverState;
  origin: ContentOrigin;
  storage: OriginalStorage;
  availability: OriginalAvailability;
  added_at: number;
  /** Source publish time, not a local file mtime. */
  published_at: number | null;
  updated_at: number;
  links: ContentAsset[];
}

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

export interface ContentNumericRange {
  min?: number;
  max?: number;
}

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

// Filtering on a facet a row lacks excludes nothing; absence is never treated as zero.
export interface ContentQuery {
  search: string;
  offset: number;
  limit: number;
  sort_by?: ContentSortKey;
  sort_dir?: ContentQuerySortDirection;
  media_kinds?: ContentMediaKind[];
  origins?: ContentOriginKind[];
  availability?: OriginalAvailability[];
  duration_ms?: ContentNumericRange;
  resolution?: ContentNumericRange;
  size_bytes?: ContentNumericRange;
  added_at?: ContentNumericRange;
  published_at?: ContentNumericRange;
  label_ids?: string[];
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
