import { createReadStream } from 'node:fs';
import type { Post, PostPlan } from '../../../core/distribution/distribution-contracts.js';
import type {
  Destination,
  DestinationCredentials,
  NamedProblem,
  PublicationMedia,
  PublicationPrivacy,
  ReconcileOutcome,
  SubmitOutcome,
  UploadSource,
} from '../../../core/distribution/publishing/contracts.js';
import {
  TIKTOK_CAPABILITIES,
  tiktokPostInfo,
  tiktokPreflight,
  tiktokUploadPlan,
} from '../../../core/distribution/publishing/tiktok.js';
import { errorCodeOf, isDefiniteRefusal, publishError } from './publishing-error.js';
import { mapTikTokError, TikTokApi, type TikTokCreatorInfo } from './tiktok-api.js';

export const DEFAULT_TIKTOK_BASE_URL = 'https://open.tiktokapis.com';

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

function contentType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

// The privacy TikTok actually granted, mapped to the shared vocabulary for the UI.
function grantedPrivacy(privacyLevel: string): PublicationPrivacy {
  if (privacyLevel === 'SELF_ONLY') return 'private';
  if (privacyLevel === 'PUBLIC_TO_EVERYONE') return 'public';
  return 'unlisted';
}

function uploadRefusal(response: Response, sent: boolean): Promise<Error> {
  return response
    .json()
    .catch(() => null)
    .then((payload: unknown) => {
      const body = payload as { error?: { code?: unknown } } | null;
      const code = body?.error?.code;
      const mapped = mapTikTokError(typeof code === 'string' ? code : undefined);
      // Definite only when nothing was sent yet and the platform named a real 4xx refusal.
      const definite =
        !sent && response.status >= 400 && response.status < 500 && mapped !== 'PUBLISH_FAILED';
      return publishError(mapped, { definite });
    });
}

export interface TikTokAdapterOptions {
  accessToken: string;
  videoSizeBytes: number;
  videoDurationMs?: number;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** TikTok Direct Post on Content Posting API v2; outcomes are raw so core owns the transitions. */
export class TikTokDestination implements Destination {
  readonly capabilities = TIKTOK_CAPABILITIES;
  // Upload completion publishes: once a chunk is accepted an interruption may already be public.
  readonly upload_publishes = true;
  #api: TikTokApi;
  #baseUrl: string;
  #fetch: typeof fetch;
  #videoSize: number;
  #videoDurationMs: number | null;
  #uploadUrls = new Map<string, string>();

  constructor(options: TikTokAdapterOptions) {
    if (!options.accessToken) throw new Error('CHANNEL_NOT_CONNECTED');
    this.#videoSize = options.videoSizeBytes;
    this.#videoDurationMs = options.videoDurationMs ?? null;
    this.#baseUrl = options.baseUrl ?? DEFAULT_TIKTOK_BASE_URL;
    this.#fetch = options.fetch ?? fetch;
    this.#api = new TikTokApi({
      accessToken: options.accessToken,
      baseUrl: this.#baseUrl,
      fetch: this.#fetch,
    });
  }

  preflight(post: Post, media: PublicationMedia, now: number): NamedProblem[] {
    return tiktokPreflight(post, media, now);
  }

  async creatorInfo(): Promise<TikTokCreatorInfo> {
    return this.#api.creatorInfo();
  }

  async begin(post: Post, _credentials: DestinationCredentials): Promise<{ remote_ref: string }> {
    const options = post.options.tiktok;
    if (!options) throw new Error('PUBLISH_OPTIONS_REQUIRED');
    const info = await this.#api.creatorInfo();
    if (!info.privacy_level_options.includes(options.privacy_level))
      throw new Error('PUBLISH_OPTIONS_INVALID');
    if (
      info.max_video_post_duration_ms !== null &&
      this.#videoDurationMs !== null &&
      this.#videoDurationMs > info.max_video_post_duration_ms
    )
      throw new Error('PUBLISH_MEDIA_TOO_LONG');
    const plan = tiktokUploadPlan(this.#videoSize);
    const init = await this.#api.init(tiktokPostInfo(post, options), {
      video_size: this.#videoSize,
      chunk_size: plan.chunk_size,
      total_chunk_count: plan.total_chunk_count,
    });
    this.#uploadUrls.set(init.publish_id, init.upload_url);
    return { remote_ref: init.publish_id };
  }

  async upload(
    remote_ref: string,
    file: UploadSource,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const uploadUrl = this.#uploadUrls.get(remote_ref);
    if (!uploadUrl) throw publishError('PUBLISH_STATE_LOST');
    const size = file.size_bytes;
    const { chunk_size, total_chunk_count } = tiktokUploadPlan(size);
    const type = contentType(file.path);
    let offset = 0;
    let sent = false;
    for (let index = 0; index < total_chunk_count; index += 1) {
      const length = Math.min(chunk_size, size - offset);
      const end = offset + length - 1;
      const stream = createReadStream(file.path, { start: offset, end });
      const response = await this.#fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${offset}-${end}/${size}`,
          'Content-Length': String(length),
          'Content-Type': type,
        },
        body: stream,
        signal,
        duplex: 'half',
      } as unknown as RequestInit);
      if (!response.ok) throw await uploadRefusal(response, sent);
      sent = true;
      offset = end + 1;
      onProgress(size > 0 ? offset / size : 1);
    }
    onProgress(1);
  }

  async submit(remote_ref: string, post: Post, _plan: PostPlan | null): Promise<SubmitOutcome> {
    const privacy = grantedPrivacy(post.options.tiktok?.privacy_level ?? '');
    const status = await this.#api.status(remote_ref);
    if (status.kind === 'complete')
      return { kind: 'published', remote_post_id: status.post_id, remote_url: null, privacy };
    if (status.kind === 'failed') return { kind: 'failed', error: status.error };
    return { kind: 'submitted' };
  }

  async reconcile(
    remote_ref: string,
    post: Post,
    credentials: DestinationCredentials,
    _now: number,
  ): Promise<ReconcileOutcome> {
    const privacy = grantedPrivacy(post.options.tiktok?.privacy_level ?? '');
    const api = new TikTokApi({
      accessToken: credentials.access_token,
      baseUrl: this.#baseUrl,
      fetch: this.#fetch,
    });
    let status: Awaited<ReturnType<TikTokApi['status']>>;
    try {
      status = await api.status(remote_ref);
    } catch (error) {
      // A definite refusal is a real failure; anything ambiguous (5xx, timeout, unparseable body)
      // must not be retried automatically.
      return isDefiniteRefusal(error)
        ? { kind: 'failed', error: errorCodeOf(error) }
        : { kind: 'unknown', error: errorCodeOf(error) };
    }
    if (status.kind === 'complete')
      return { kind: 'published', remote_post_id: status.post_id, remote_url: null, privacy };
    if (status.kind === 'failed') return { kind: 'failed', error: status.error };
    if (status.kind === 'processing') return { kind: 'submitted' };
    return { kind: 'unknown', error: status.error };
  }
}
