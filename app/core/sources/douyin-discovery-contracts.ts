// Only the pathname is carried — never query string or headers — so a token cannot reach a log.
export interface DouyinObservedResponse {
  path: string;
  httpStatus: number;
  body: string;
}

export type DouyinFailureKind =
  | 'rate_limited'
  /** Session absent/expired; never an empty result. */
  | 'login_required'
  /** Edge-gate refusal; never auto-retried. */
  | 'verification_required'
  | 'timeout'
  | 'page_load_failed'
  | 'malformed'
  | 'rejected';

export interface DouyinFailure {
  kind: DouyinFailureKind;
  /** True only for `rate_limited`. */
  retryable: boolean;
  statusCode: number | null;
  statusMessage: string | null;
  httpStatus: number | null;
}

export type DouyinOutcome<T> = { ok: true; value: T } | { ok: false; failure: DouyinFailure };

export interface DouyinQualityTier {
  gearName: string | null;
  bitRate: number | null;
  width: number | null;
  height: number | null;
  dataSize: number | null;
  codec: string | null;
  /** url_list mirrors expire, so they are deliberately not carried here. */
  uri: string | null;
}

export interface DouyinAuthor {
  uid: string | null;
  nickname: string | null;
  /** Durable channel identity; nicknames change and collide, this does not. */
  secUid: string | null;
  avatarUri: string | null;
}

export interface DouyinStatistics {
  diggCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  collectCount: number | null;
  playCount: number | null;
  capturedAt: number;
}

export type DouyinMediaType = 'video' | 'image' | 'slides';

export interface DouyinVideoMedia {
  durationMs: number | null;
  ratio: string | null;
  format: string | null;
  coverUri: string | null;
  tiers: DouyinQualityTier[];
}

export interface DouyinDetail {
  awemeId: string;
  mediaType: DouyinMediaType;
  description: string;
  /** Epoch seconds, as Douyin reports it. */
  createTime: number | null;
  shareUrl: string | null;
  author: DouyinAuthor;
  video: DouyinVideoMedia | null;
  statistics: DouyinStatistics;
  raw: unknown;
}

export interface DouyinPostPage {
  videos: DouyinDetail[];
  maxCursor: number | null;
  hasMore: boolean;
}

export interface DouyinChannelRef {
  secUid: string;
  nickname: string | null;
}

export interface DouyinSearchResult {
  exact: DouyinDetail | null;
  channel: DouyinChannelRef | null;
  videos: DouyinDetail[];
  retrieved: number;
  mayHaveMore: boolean;
  truncated: boolean;
  partialFailure: DouyinFailure | null;
}

// Sending raw over IPC is forbidden by the runtime split.
export type DouyinItem = Omit<DouyinDetail, 'raw'>;

export interface DouyinSearchView {
  exact: DouyinItem | null;
  channel: DouyinChannelRef | null;
  videos: DouyinItem[];
  retrieved: number;
  mayHaveMore: boolean;
  truncated: boolean;
  partialFailure: DouyinFailure | null;
}
