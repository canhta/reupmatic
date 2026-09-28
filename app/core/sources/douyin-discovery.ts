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

// Edge-gate marker; distinguishes a permanent refusal from throttling.
const REFUSAL_MARKER = 'ArgusSecurityPlugin';

export function isDouyinRefusalBody(body: string): boolean {
  return body.includes(REFUSAL_MARKER);
}

export interface DouyinBodySummary {
  kind: 'json' | 'refusal' | 'empty' | 'not-json';
  statusCode?: number | null;
  items?: number | null;
  hasMore?: boolean | null;
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

// Douyin's "please log in first" status code.
const LOGIN_REQUIRED_STATUS = new Set([2483]);
const LOGIN_REQUIRED_TEXT = ['请先登录', 'login'];

export const DOUYIN_ORIGIN = 'https://www.douyin.com';
export const DOUYIN_DETAIL_PATH = '/aweme/v1/web/aweme/detail/';
export const DOUYIN_POST_PATH = '/aweme/v1/web/aweme/post/';

const CHALLENGE_PATH_MARKERS = [
  '/verifycenter/',
  '/rc-verifycenter/',
  '/sec_sdk_build/',
  '/captcha/',
] as const;

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

// Order matters: refusal marker before status-family rules.
export function classifyDouyinResponse(
  response: DouyinObservedResponse,
): DouyinOutcome<Record<string, unknown>> {
  const { httpStatus, body } = response;

  if (httpStatus === 200 && body.trim() === '') {
    return { ok: false, failure: failure('login_required', { httpStatus }) };
  }
  if (body.includes(REFUSAL_MARKER)) {
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

// Missing dimensions sort last, never best.
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
      // Absence of is_h265 means the default codec, not "unknown".
      codec:
        gear.is_h265 === 1 || gear.is_h265 === true ? 'h265' : (asString(gear.format) ?? 'h264'),
      uri: asString(address.uri),
    });
  }
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

// Douyin sends a `video` block for image posts too, so images are read explicitly.
function readMediaType(aweme: Record<string, unknown>): DouyinMediaType {
  const images = Array.isArray(aweme.images) ? aweme.images : null;
  if (!images || images.length === 0) return 'video';
  return images.length > 1 ? 'slides' : 'image';
}

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

// A missing aweme_list is a failure; an empty list is a real page.
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
