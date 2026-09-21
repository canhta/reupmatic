/**
 * Discovery over plain HTTP: the typed shape of one HTTP response, one video's detail, and one
 * channel page, plus the classification and mapping that turn a raw response into either.
 *
 * The transport itself is Electron's `web-api.ts`, issuing the request directly with the
 * `persist:douyin` partition's cookies and no signature (D-62 — no
 * `a_bogus`/`X-Bogus`/`msToken` is generated or vendored). Everything here is pure over the
 * response text, so classification and mapping stay unit-testable without a browser or a live
 * Douyin.
 */

/**
 * One HTTP response, reduced to what classification needs. Only the pathname is carried — never
 * the query string and never headers — so a session token cannot ride along into a log record.
 */
export interface DouyinObservedResponse {
  path: string;
  httpStatus: number;
  /** Unparsed body. Parsing is the classifier's job so a non-JSON 200 is a named outcome. */
  body: string;
}

export type DouyinFailureKind =
  /** Ordinary throttling (429, a 5xx, a transport error). The kind that may be retried. */
  | 'rate_limited'
  /** The session is absent or expired — including a `200` with an empty body, D-62's evidence for
   * "no cookie" — so the user must reconnect. Never an empty result. */
  | 'login_required'
  /**
   * Douyin's edge gate refused the request outright (the `ArgusSecurityPlugin` marker). Retrying
   * is not effective — the reference project documents this as deterministic — so this is never
   * retried automatically; the headed verification window is the user's recovery path (D-62): a
   * real browser visit clears whatever the gate wants, and the plain HTTP request is retried
   * afterwards.
   */
  | 'verification_required'
  | 'timeout'
  | 'page_load_failed'
  /** A 200 whose body was not the JSON shape this endpoint promises. */
  | 'malformed'
  /** Douyin answered with a `status_code` we do not recognise. Not retried: we do not know why. */
  | 'rejected';

export interface DouyinFailure {
  kind: DouyinFailureKind;
  /** True only for `rate_limited`. Every other kind is permanent for this attempt. */
  retryable: boolean;
  /** Douyin's own `status_code`, when the body carried one. */
  statusCode: number | null;
  statusMessage: string | null;
  httpStatus: number | null;
}

export type DouyinOutcome<T> = { ok: true; value: T } | { ok: false; failure: DouyinFailure };

/**
 * One rung of `video.bit_rate[]` — what the source *offered*. Kept in full because storing only
 * the tier we downloaded makes "do we already hold the best copy?" and "does this need
 * re-encoding?" unanswerable without re-fetching (spec.md, "What metadata we persist").
 */
export interface DouyinQualityTier {
  gearName: string | null;
  bitRate: number | null;
  width: number | null;
  height: number | null;
  /** Bytes, from `play_addr.data_size`. Present before download — not an estimate. */
  dataSize: number | null;
  codec: string | null;
  /** Stable-ish id. The `url_list` mirrors expire, so they are deliberately not carried here. */
  uri: string | null;
}

export interface DouyinAuthor {
  uid: string | null;
  nickname: string | null;
  /** The durable channel identity. Nicknames change and collide; this does not. */
  secUid: string | null;
  avatarUri: string | null;
}

/**
 * Counters are true at the instant they were read, so `capturedAt` travels with them. A stored
 * count without its capture time silently becomes a lie (spec.md).
 */
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
  /** The whole ladder the source offered, sorted best-first (most pixels, then highest bit rate)
   * by the one projection that builds it (`readTiers`, `douyin-discovery.ts`) — Douyin's own
   * `bit_rate[]` order is not reliably best-first (live evidence). */
  tiers: DouyinQualityTier[];
}

export interface DouyinDetail {
  awemeId: string;
  mediaType: DouyinMediaType;
  description: string;
  /** Original publish time in epoch seconds, as Douyin reports it. Distinct from our own dates. */
  createTime: number | null;
  shareUrl: string | null;
  author: DouyinAuthor;
  video: DouyinVideoMedia | null;
  statistics: DouyinStatistics;
  /**
   * The untouched payload, retained once at this boundary so a facet we did not anticipate needs
   * no second request. Persisting it is ticket 09's contract, not this module's.
   */
  raw: unknown;
}

/**
 * One page of a channel's posts. `maxCursor`/`hasMore` are Douyin's own pagination controls: the
 * caller may only continue while `hasMore` is true, and must stop at a hard page cap so a
 * `has_more` stuck true cannot loop forever (ticket 05).
 */
export interface DouyinPostPage {
  videos: DouyinDetail[];
  maxCursor: number | null;
  hasMore: boolean;
}

/** The owning channel of a discovered item, keyed on the durable `sec_uid`. */
export interface DouyinChannelRef {
  secUid: string;
  nickname: string | null;
}

/**
 * The one Search action's result (spec.md, "Search is one action, with two results"): the exact
 * item a video link pointed at (absent for a channel link) plus the channel and its listed videos.
 *
 * `retrieved`/`mayHaveMore`/`truncated` make the partial-coverage rule explicit — an empty list
 * must never read as "this channel has nothing" — and `partialFailure` carries a risk-control
 * cut-off that happened after some pages arrived, with those pages kept usable.
 */
export interface DouyinSearchResult {
  exact: DouyinDetail | null;
  channel: DouyinChannelRef | null;
  videos: DouyinDetail[];
  retrieved: number;
  mayHaveMore: boolean;
  /** True when the hard page cap was reached while Douyin still reported more. */
  truncated: boolean;
  /** A failure that stopped a later page; items already retrieved stay usable. */
  partialFailure: DouyinFailure | null;
}

/**
 * A discovery item as it crosses the typed IPC boundary: the projection without the untouched
 * payload. The raw payload stays at the discovery boundary in Electron (ticket 09 persists it);
 * sending it to the renderer would be exactly the "raw payload over IPC" the runtime split
 * forbids (spec.md, "Runtime split").
 */
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
