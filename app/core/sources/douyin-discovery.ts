/**
 * Douyin discovery: classifying one HTTP response and projecting one `aweme` payload into the
 * typed shapes the rest of the app renders.
 *
 * The transport itself is plain HTTP to the web API, with the user's own session
 * (D-62) — Electron's `web-api.ts` issues the request with the
 * `persist:douyin` partition's cookies and a desktop browser's base query, no signature
 * generated or vendored. Everything here is pure over the response text, so classification and
 * mapping stay unit-testable without a browser or a live Douyin.
 */
import type {
  DouyinAuthor,
  DouyinDetail,
  DouyinFailure,
  DouyinFailureKind,
  DouyinMediaType,
  DouyinObservedResponse,
  DouyinOutcome,
  DouyinPostPage,
  DouyinQualityTier,
  DouyinStatistics,
  DouyinVideoMedia,
} from './douyin-discovery-contracts.js';

/**
 * The edge gate's own marker. The connector review §3 quotes the
 * reference project verbatim: `aweme/detail` and `aweme/post` can be answered
 * `403 Blocked by ArgusSecurityPlugin Uifid Not Found`. D-62's live evidence is that
 * an *unsigned* plain HTTP request with the user's own session usually succeeds; when the gate
 * does refuse, matching this marker rather than the bare 403 is the discriminator between that
 * permanent refusal and ordinary throttling — see `classifyDouyinResponse`.
 */
const REFUSAL_MARKER = 'ArgusSecurityPlugin';

/** True when a response body carries the edge gate's own refusal marker. */
export function isDouyinRefusalBody(body: string): boolean {
  return body.includes(REFUSAL_MARKER);
}

/**
 * What one captured body *was*, as values only (D-61): enough for the Diagnostic log to explain
 * why a walk stopped — a refusal, a risk-control `aweme_list: null`, a real end (`has_more: 0`) —
 * without writing the payload, whose captions and author text are untrusted content.
 */
export interface DouyinBodySummary {
  kind: 'json' | 'refusal' | 'empty' | 'not-json';
  statusCode?: number | null;
  /** List length, `1` for a detail, `null` when the list is absent or `null`. */
  items?: number | null;
  hasMore?: boolean | null;
  /** Whether a pagination cursor came back at all. */
  cursor?: boolean;
}

export function summarizeDouyinBody(body: string): DouyinBodySummary {
  if (body.trim() === '') return { kind: 'empty' };
  if (isDouyinRefusalBody(body)) return { kind: 'refusal' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { kind: 'not-json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'not-json' };
  const value = parsed as Record<string, unknown>;
  const items = Array.isArray(value.aweme_list)
    ? value.aweme_list.length
    : value.aweme_detail && typeof value.aweme_detail === 'object'
      ? 1
      : null;
  const hasMore =
    value.has_more === undefined || value.has_more === null
      ? null
      : value.has_more === true || value.has_more === 1;
  return {
    kind: 'json',
    statusCode: typeof value.status_code === 'number' ? value.status_code : null,
    items,
    hasMore,
    cursor: typeof value.max_cursor === 'number' && value.max_cursor > 0,
  };
}

/** Douyin's own "please log in first" status. Narrow by design, and widened only on evidence. */
const LOGIN_REQUIRED_STATUS = new Set([2483]);
const LOGIN_REQUIRED_TEXT = ['请先登录', 'login'];

export const DOUYIN_ORIGIN = 'https://www.douyin.com';
export const DOUYIN_DETAIL_PATH = '/aweme/v1/web/aweme/detail/';
export const DOUYIN_POST_PATH = '/aweme/v1/web/aweme/post/';

/**
 * The risk-control challenge's own traffic. Kept for the one thing that still needs it: the
 * headed login/verification window (`login-window.ts`) tells a challenge page apart from a
 * cleared one by pathname, so it knows when to hand control back. Discovery itself no longer
 * visits a page to observe this (D-62) — it issues the HTTP request directly.
 */
const CHALLENGE_PATH_MARKERS = [
  '/verifycenter/',
  '/rc-verifycenter/',
  '/sec_sdk_build/',
  '/captcha/',
] as const;

/** True when a response pathname belongs to Douyin's verification challenge, not an API endpoint. */
export function isDouyinChallengePath(pathname: string): boolean {
  return CHALLENGE_PATH_MARKERS.some((marker) => pathname.includes(marker));
}

function failure(
  kind: DouyinFailureKind,
  parts: Partial<Omit<DouyinFailure, 'kind' | 'retryable'>> = {},
): DouyinFailure {
  return {
    kind,
    retryable: kind === 'rate_limited',
    statusCode: parts.statusCode ?? null,
    statusMessage: parts.statusMessage ?? null,
    httpStatus: parts.httpStatus ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function looksLikeLoginPrompt(message: string | null): boolean {
  if (!message) return false;
  const lowered = message.toLowerCase();
  return LOGIN_REQUIRED_TEXT.some((needle) => lowered.includes(needle.toLowerCase()));
}

/**
 * Turns one raw response into either its parsed body or a named failure.
 *
 * The ordering matters. A refusal is checked by marker before any status-family rule, because a
 * bare 403 is ordinary throttling and a marked one is permanent — treating them alike is what
 * produces a request storm against an endpoint that will never answer. An empty body is checked
 * before JSON parsing for the same reason D-62's live evidence records: an unsigned request with
 * no cookie answers `200` with an *empty* body, which must read as "session missing", never as an
 * empty channel or a malformed payload.
 */
export function classifyDouyinResponse(
  response: DouyinObservedResponse,
): DouyinOutcome<Record<string, unknown>> {
  const { httpStatus, body } = response;

  if (httpStatus === 200 && body.trim() === '') {
    return { ok: false, failure: failure('login_required', { httpStatus }) };
  }
  if (body.includes(REFUSAL_MARKER)) {
    // Douyin's edge gate refusing a plain, unsigned request is exactly the case the headed
    // verification window exists to recover from (D-62): the user clears whatever the gate wants
    // in a real browser window, and the plain HTTP request is retried afterwards. It shares the
    // `verification_required` kind — and its UI recovery action — rather than a distinct
    // `refused` kind that no longer names a different recovery path.
    return { ok: false, failure: failure('verification_required', { httpStatus }) };
  }
  if (httpStatus === 429 || httpStatus === 403) {
    return { ok: false, failure: failure('rate_limited', { httpStatus }) };
  }
  if (httpStatus >= 500) {
    return { ok: false, failure: failure('rate_limited', { httpStatus }) };
  }
  if (httpStatus !== 200) {
    return { ok: false, failure: failure('rejected', { httpStatus }) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, failure: failure('malformed', { httpStatus }) };
  }
  const payload = asRecord(parsed);
  if (!payload) return { ok: false, failure: failure('malformed', { httpStatus }) };

  const statusCode = asNumber(payload.status_code);
  const statusMessage = asString(payload.status_msg);
  if (
    (statusCode !== null && LOGIN_REQUIRED_STATUS.has(statusCode)) ||
    looksLikeLoginPrompt(statusMessage)
  ) {
    return {
      ok: false,
      failure: failure('login_required', { httpStatus, statusCode, statusMessage }),
    };
  }
  if (statusCode !== null && statusCode !== 0) {
    return { ok: false, failure: failure('rejected', { httpStatus, statusCode, statusMessage }) };
  }
  return { ok: true, value: payload };
}

/** Most pixels first, then highest bit rate — a missing dimension or rate sorts last rather than
 * being assumed best. Live evidence (, coordinator): Douyin's own `bit_rate[]` order is
 * not reliably best-first (the reference downloader picks the same way, `pixels` desc then
 * `bit_rate` desc, `downloader_base.py:1436-1486`), so the ladder is sorted here, once, at the
 * single place every caller's "tier 0 is best" assumption reads it. */
function bestTierFirst(a: DouyinQualityTier, b: DouyinQualityTier): number {
  const pixelsOf = (tier: DouyinQualityTier) =>
    tier.width !== null && tier.height !== null ? tier.width * tier.height : -1;
  const pixels = pixelsOf(b) - pixelsOf(a);
  if (pixels !== 0) return pixels;
  return (b.bitRate ?? -1) - (a.bitRate ?? -1);
}

function readTiers(video: Record<string, unknown>): DouyinQualityTier[] {
  const ladder = Array.isArray(video.bit_rate) ? video.bit_rate : [];
  const tiers: DouyinQualityTier[] = [];
  for (const entry of ladder) {
    const gear = asRecord(entry);
    if (!gear) continue;
    const address = asRecord(gear.play_addr) ?? {};
    tiers.push({
      gearName: asString(gear.gear_name),
      bitRate: asNumber(gear.bit_rate),
      width: asNumber(address.width),
      height: asNumber(address.height),
      dataSize: asNumber(address.data_size),
      // `is_h265` is Douyin's own flag; absence means the default codec, not "unknown".
      codec:
        gear.is_h265 === 1 || gear.is_h265 === true ? 'h265' : (asString(gear.format) ?? 'h264'),
      uri: asString(address.uri),
    });
  }
  // `Array.prototype.sort` is stable (ES2019+), so two tiers with identical pixels and bit rate
  // keep Douyin's own relative order rather than being shuffled.
  return tiers.sort(bestTierFirst);
}

function readVideo(aweme: Record<string, unknown>): DouyinVideoMedia | null {
  const video = asRecord(aweme.video);
  if (!video) return null;
  const cover = asRecord(video.cover) ?? asRecord(video.origin_cover) ?? {};
  return {
    durationMs: asNumber(video.duration) ?? asNumber(aweme.duration),
    ratio: asString(video.ratio),
    format: asString(video.format),
    coverUri: asString(cover.uri),
    tiers: readTiers(video),
  };
}

function readAuthor(aweme: Record<string, unknown>): DouyinAuthor {
  const author = asRecord(aweme.author) ?? {};
  const avatar = asRecord(author.avatar_thumb) ?? asRecord(author.avatar_larger) ?? {};
  return {
    uid: asString(author.uid),
    nickname: asString(author.nickname),
    secUid: asString(author.sec_uid),
    avatarUri: asString(avatar.uri),
  };
}

function readStatistics(aweme: Record<string, unknown>, capturedAt: number): DouyinStatistics {
  const stats = asRecord(aweme.statistics) ?? {};
  return {
    diggCount: asNumber(stats.digg_count),
    commentCount: asNumber(stats.comment_count),
    shareCount: asNumber(stats.share_count),
    collectCount: asNumber(stats.collect_count),
    playCount: asNumber(stats.play_count),
    capturedAt,
  };
}

/**
 * Image posts and slides are not videos. Storing one in a video-shaped record is corruption that
 * only surfaces much later, in the Editor (spec.md), so the type is read explicitly rather than
 * assumed from the presence of a `video` block — Douyin sends one for image posts too.
 */
function readMediaType(aweme: Record<string, unknown>): DouyinMediaType {
  const images = Array.isArray(aweme.images) ? aweme.images : null;
  if (!images || images.length === 0) return 'video';
  return images.length > 1 ? 'slides' : 'image';
}

/**
 * Projects one `aweme/detail` payload into the typed result, keeping the raw payload alongside.
 *
 * A payload that parsed cleanly but carries no `aweme_detail` is a failure, never an empty
 * success: a false "0 results, success" is the failure mode this whole path exists to avoid.
 */
/**
 * Projects one `aweme` object. Shared by the single-item detail path and each entry of a channel
 * page, so a facet read for one is read identically for the other. `raw` is whichever payload
 * this item came in on, kept once at the discovery boundary.
 */
function projectAweme(
  aweme: Record<string, unknown>,
  capturedAt: number,
  raw: unknown,
): DouyinDetail | null {
  const awemeId = asString(aweme.aweme_id);
  if (!awemeId) return null;
  const mediaType = readMediaType(aweme);
  return {
    awemeId,
    mediaType,
    description: asString(aweme.desc) ?? '',
    createTime: asNumber(aweme.create_time),
    shareUrl: asString(asRecord(aweme.share_info)?.share_url) ?? asString(aweme.share_url),
    author: readAuthor(aweme),
    video: mediaType === 'video' ? readVideo(aweme) : null,
    statistics: readStatistics(aweme, capturedAt),
    raw,
  };
}

export function mapDouyinDetail(
  payload: Record<string, unknown>,
  capturedAt: number,
): DouyinOutcome<DouyinDetail> {
  const aweme = asRecord(payload.aweme_detail);
  if (!aweme) return { ok: false, failure: failure('malformed', { httpStatus: 200 }) };
  const detail = projectAweme(aweme, capturedAt, payload);
  if (!detail) return { ok: false, failure: failure('malformed', { httpStatus: 200 }) };
  return { ok: true, value: detail };
}

/**
 * Projects one `aweme/post` page.
 *
 * A missing `aweme_list` is a failure, never an empty success: a false "0 videos, success" is the
 * failure mode the discovery path exists to avoid. An empty list, by contrast, is a real page and
 * is returned as such. One unreadable entry is skipped rather than failing the page it arrived in.
 */
export function mapDouyinProfilePage(
  payload: Record<string, unknown>,
  capturedAt: number,
): DouyinOutcome<DouyinPostPage> {
  const list = Array.isArray(payload.aweme_list) ? payload.aweme_list : null;
  if (!list) return { ok: false, failure: failure('malformed', { httpStatus: 200 }) };
  const videos: DouyinDetail[] = [];
  for (const entry of list) {
    const aweme = asRecord(entry);
    if (!aweme) continue;
    const projected = projectAweme(aweme, capturedAt, entry);
    if (projected) videos.push(projected);
  }
  return {
    ok: true,
    value: {
      videos,
      maxCursor: asNumber(payload.max_cursor),
      hasMore: payload.has_more === 1 || payload.has_more === true,
    },
  };
}
