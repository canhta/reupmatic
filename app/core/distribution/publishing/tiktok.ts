import type { Post } from '../distribution-contracts.js';
import { composeCaption } from './caption.js';
import type {
  DestinationCapabilities,
  NamedProblem,
  PublicationMedia,
  PublishProblemCode,
  TikTokPostOptions,
} from './contracts.js';

// Verified against TikTok's Content Posting API v2 Direct Post (see ADR 0001): no scheduling API,
// ≤ 10 min, ≤ 4 GB, 23–60 fps, 360–4096 px, title (the caption) ≤ 2200 UTF-16 units.
export const TIKTOK_CAPABILITIES: DestinationCapabilities = {
  native_schedule: null,
  media: {
    min_ms: 0,
    max_ms: 10 * 60 * 1000,
    min_width: 360,
    min_height: 360,
    max_bytes: 4 * 1024 * 1024 * 1024,
    aspect: 'any',
  },
  caption: { title_max: 2200, body_max: 2200 },
};

// Content Sharing Guidelines: interaction settings must be off until the user turns them on, and
// privacy_level has no default (it comes from the creator's privacy_level_options).
export const TIKTOK_DEFAULT_OPTIONS = {
  privacy_level: '',
  allow_comment: false,
  allow_duet: false,
  allow_stitch: false,
  disclose: false,
  brand_content_toggle: false,
  brand_organic_toggle: false,
  is_aigc: false,
} as const satisfies TikTokPostOptions;

export const TIKTOK_MAX_DIMENSION = 4096;
export const TIKTOK_MIN_FPS = 23;
export const TIKTOK_MAX_FPS = 60;
export const TIKTOK_CHUNK_MIN_BYTES = 5 * 1024 * 1024;
export const TIKTOK_CHUNK_MAX_BYTES = 64 * 1024 * 1024;
export const TIKTOK_MAX_CHUNKS = 1000;

function problem(
  code: PublishProblemCode,
  severity: NamedProblem['severity'] = 'blocking',
  params?: Record<string, number>,
) {
  return { code, severity, ...(params ? { params } : {}) } satisfies NamedProblem;
}

export interface TikTokCreatorLimits {
  max_video_post_duration_ms: number | null;
}

export function tiktokPreflight(
  post: Post,
  media: PublicationMedia,
  _now: number,
  limits: TikTokCreatorLimits = { max_video_post_duration_ms: null },
): NamedProblem[] {
  const problems: NamedProblem[] = [];
  if (post.planned !== null) problems.push(problem('PUBLISH_SCHEDULE_UNSUPPORTED'));
  const options = post.options?.tiktok ?? null;
  if (options?.disclose && !options.brand_content_toggle && !options.brand_organic_toggle)
    problems.push(problem('PUBLISH_DISCLOSURE_REQUIRED'));
  // A third-party paid partnership must be publicly labelled, so SELF_ONLY is not allowed.
  if (options?.brand_content_toggle && options.privacy_level === 'SELF_ONLY')
    problems.push(problem('PUBLISH_PRIVACY_BRANDED_SELF_ONLY'));
  const maxDuration =
    limits.max_video_post_duration_ms === null
      ? TIKTOK_CAPABILITIES.media.max_ms
      : Math.min(TIKTOK_CAPABILITIES.media.max_ms, limits.max_video_post_duration_ms);
  if (media.duration_ms > maxDuration)
    problems.push(problem('PUBLISH_MEDIA_TOO_LONG', 'blocking', { seconds: maxDuration / 1000 }));
  if (media.size_bytes > TIKTOK_CAPABILITIES.media.max_bytes)
    problems.push(
      problem('PUBLISH_MEDIA_TOO_LARGE', 'blocking', {
        gigabytes: TIKTOK_CAPABILITIES.media.max_bytes / 1024 ** 3,
      }),
    );
  if (
    media.width < TIKTOK_CAPABILITIES.media.min_width ||
    media.height < TIKTOK_CAPABILITIES.media.min_height ||
    media.width > TIKTOK_MAX_DIMENSION ||
    media.height > TIKTOK_MAX_DIMENSION
  )
    problems.push(
      problem('PUBLISH_MEDIA_RESOLUTION', 'blocking', {
        min_width: TIKTOK_CAPABILITIES.media.min_width,
        min_height: TIKTOK_CAPABILITIES.media.min_height,
      }),
    );
  if (media.fps < TIKTOK_MIN_FPS || media.fps > TIKTOK_MAX_FPS)
    problems.push(
      problem('PUBLISH_MEDIA_FRAMERATE', 'blocking', { min: TIKTOK_MIN_FPS, max: TIKTOK_MAX_FPS }),
    );
  if (composeCaption(post, TIKTOK_CAPABILITIES).clipped)
    problems.push(
      problem('PUBLISH_CAPTION_CLIPPED', 'warning', {
        limit: TIKTOK_CAPABILITIES.caption.body_max,
      }),
    );
  return problems;
}

// The composed caption (body then links), clipped to the platform's title limit.
export function tiktokCaptionTitle(post: Pick<Post, 'title' | 'body' | 'links'>): string {
  return composeCaption(post, TIKTOK_CAPABILITIES).body;
}

export function tiktokPostInfo(
  post: Pick<Post, 'title' | 'body' | 'links'>,
  options: TikTokPostOptions,
): Record<string, string | boolean> {
  return {
    title: tiktokCaptionTitle(post),
    privacy_level: options.privacy_level,
    disable_comment: !options.allow_comment,
    disable_duet: !options.allow_duet,
    disable_stitch: !options.allow_stitch,
    brand_content_toggle: options.brand_content_toggle,
    brand_organic_toggle: options.brand_organic_toggle,
    is_aigc: options.is_aigc,
  };
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('INVALID_REQUEST');
  return value;
}

export function parseTikTokOptions(input: unknown): TikTokPostOptions | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_REQUEST');
  const value = input as Record<string, unknown>;
  const privacy = value.privacy_level;
  if (typeof privacy !== 'string' || !privacy || privacy.length > 64)
    throw new Error('INVALID_REQUEST');
  return {
    privacy_level: privacy,
    allow_comment: requiredBoolean(value.allow_comment),
    allow_duet: requiredBoolean(value.allow_duet),
    allow_stitch: requiredBoolean(value.allow_stitch),
    disclose: requiredBoolean(value.disclose),
    brand_content_toggle: requiredBoolean(value.brand_content_toggle),
    brand_organic_toggle: requiredBoolean(value.brand_organic_toggle),
    is_aigc: requiredBoolean(value.is_aigc),
  };
}

// The commercial-content label the post will carry; a paid partnership outranks own promotion.
export function tiktokDisclosure(
  options: Pick<TikTokPostOptions, 'brand_content_toggle' | 'brand_organic_toggle'>,
): 'paid_partnership' | 'promotional_content' | null {
  if (options.brand_content_toggle) return 'paid_partnership';
  if (options.brand_organic_toggle) return 'promotional_content';
  return null;
}

export interface TikTokUploadPlan {
  chunk_size: number;
  total_chunk_count: number;
}

// FILE_UPLOAD sizing: a single chunk under 5 MB, otherwise 5–64 MB chunks within 1000 chunks.
export function tiktokUploadPlan(sizeBytes: number): TikTokUploadPlan {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) throw new Error('INVALID_MEDIA');
  if (sizeBytes <= TIKTOK_CHUNK_MIN_BYTES) return { chunk_size: sizeBytes, total_chunk_count: 1 };
  const perChunk = Math.ceil(sizeBytes / TIKTOK_MAX_CHUNKS);
  const chunk_size = Math.min(TIKTOK_CHUNK_MAX_BYTES, Math.max(TIKTOK_CHUNK_MIN_BYTES, perChunk));
  return { chunk_size, total_chunk_count: Math.ceil(sizeBytes / chunk_size) };
}
