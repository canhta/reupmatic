import { publishError } from './publishing-error.js';
import { TIKTOK_API_BASE_URL } from './tiktok-oauth.js';

export const TIKTOK_CREATOR_INFO_PATH = '/v2/post/publish/creator_info/query/';
export const TIKTOK_INIT_PATH = '/v2/post/publish/video/init/';
export const TIKTOK_STATUS_PATH = '/v2/post/publish/status/fetch/';

export interface TikTokCreatorInfo {
  nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_ms: number | null;
}

export interface TikTokInit {
  publish_id: string;
  upload_url: string;
}

export type TikTokStatusResult =
  | { kind: 'complete'; post_id: string | null }
  | { kind: 'processing' }
  | { kind: 'failed'; error: string }
  | { kind: 'unknown'; error: string | null };

export interface TikTokApiOptions {
  accessToken: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

// TikTok's own error codes (ADR 0001): token expiry, throttling, invalid parameters, unaudited app.
export function mapTikTokError(code: string | undefined): string {
  switch (code) {
    case 'access_token_invalid':
    case 'access_token_expired':
    case 'scope_not_authorized':
    case 'invalid_access_token':
      return 'CHANNEL_REAUTHORIZE';
    case 'rate_limit_exceeded':
    case 'spam_risk_too_many_posts':
    case 'spam_risk_user_banned_from_posting':
    case 'spam_risk_text_too_many_contents':
      return 'PUBLISH_RATE_LIMITED';
    case 'invalid_params':
    case 'invalid_file_upload':
    case 'invalid_publish_id':
      return 'PUBLISH_INVALID_REQUEST';
    case 'unaudited_client_cannot_post':
      return 'PUBLISH_PERMISSION_DENIED';
    default:
      return 'PUBLISH_FAILED';
  }
}

export function mapFailReason(reason: string | undefined): string {
  switch (reason) {
    case 'duration_check_failed':
      return 'PUBLISH_MEDIA_TOO_LONG';
    case 'frame_rate_check_failed':
      return 'PUBLISH_MEDIA_FRAMERATE';
    case 'picture_size_check_failed':
      return 'PUBLISH_MEDIA_RESOLUTION';
    case 'file_size_check_failed':
      return 'PUBLISH_MEDIA_TOO_LARGE';
    case 'file_format_check_failed':
      return 'PUBLISH_MEDIA_FORMAT';
    default:
      return 'PUBLISH_FAILED';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value) throw new Error('INVALID_TIKTOK_RESPONSE');
  return value;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error('INVALID_TIKTOK_RESPONSE');
  return value as string[];
}

/** Content Posting API v2 Direct Post; outcomes are raw so core owns the transitions. */
export class TikTokApi {
  #accessToken: string;
  #baseUrl: string;
  #fetch: typeof fetch;

  constructor(options: TikTokApiOptions) {
    if (!options.accessToken) throw new Error('CHANNEL_NOT_CONNECTED');
    this.#accessToken = options.accessToken;
    this.#baseUrl = options.baseUrl ?? TIKTOK_API_BASE_URL;
    this.#fetch = options.fetch ?? fetch;
  }

  async #post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.#accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
    const errorCode = typeof error?.code === 'string' ? error.code : undefined;
    if (!response.ok || (errorCode !== undefined && errorCode !== 'ok')) {
      const code = mapTikTokError(errorCode);
      // Only a 4xx with a code TikTok actually named is a definite refusal.
      const definite = response.status >= 400 && response.status < 500 && code !== 'PUBLISH_FAILED';
      throw publishError(code, { definite });
    }
    if (!isRecord(payload) || !isRecord(payload.data))
      throw publishError('INVALID_TIKTOK_RESPONSE');
    return payload.data;
  }

  async creatorInfo(): Promise<TikTokCreatorInfo> {
    const data = await this.#post(TIKTOK_CREATOR_INFO_PATH, {});
    const nickname = requiredString(data, 'creator_nickname');
    const maxSeconds = data.max_video_post_duration_sec;
    return {
      nickname,
      privacy_level_options: stringList(data.privacy_level_options),
      comment_disabled: data.comment_disabled === true,
      duet_disabled: data.duet_disabled === true,
      stitch_disabled: data.stitch_disabled === true,
      max_video_post_duration_ms:
        typeof maxSeconds === 'number' && Number.isFinite(maxSeconds) && maxSeconds > 0
          ? maxSeconds * 1000
          : null,
    };
  }

  async init(
    postInfo: Record<string, string | boolean>,
    sourceInfo: { video_size: number; chunk_size: number; total_chunk_count: number },
  ): Promise<TikTokInit> {
    const data = await this.#post(TIKTOK_INIT_PATH, {
      post_info: postInfo,
      source_info: { source: 'FILE_UPLOAD', ...sourceInfo },
    });
    return {
      publish_id: requiredString(data, 'publish_id'),
      upload_url: requiredString(data, 'upload_url'),
    };
  }

  async status(publishId: string): Promise<TikTokStatusResult> {
    const data = await this.#post(TIKTOK_STATUS_PATH, { publish_id: publishId });
    const status = data.status;
    if (status === 'PUBLISH_COMPLETE') {
      const postId = data.publicaly_available_post_id;
      return {
        kind: 'complete',
        post_id: typeof postId === 'string' && postId ? postId : null,
      };
    }
    if (status === 'FAILED')
      return {
        kind: 'failed',
        error: mapFailReason(typeof data.fail_reason === 'string' ? data.fail_reason : undefined),
      };
    if (status === 'PROCESSING_UPLOAD' || status === 'PROCESSING_DOWNLOAD')
      return { kind: 'processing' };
    return { kind: 'unknown', error: null };
  }
}
