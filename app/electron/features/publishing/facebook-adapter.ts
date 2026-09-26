import { createReadStream } from 'node:fs';
import type { Post, PostPlan } from '../../../core/distribution/distribution-contracts.js';
import { composeCaption } from '../../../core/distribution/publishing/caption.js';
import type {
  Destination,
  DestinationCredentials,
  NamedProblem,
  PublicationMedia,
  ReconcileOutcome,
  SubmitOutcome,
  UploadSource,
} from '../../../core/distribution/publishing/contracts.js';
import {
  FACEBOOK_CAPABILITIES,
  facebookPreflight,
} from '../../../core/distribution/publishing/facebook.js';
import { parseGraphFailure, readGraphError } from './graph.js';

export const GRAPH_VERSION = 'v25.0';
export const DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com';
export const DEFAULT_UPLOAD_BASE_URL = 'https://rupload.facebook.com/video-upload';

export interface FacebookAdapterOptions {
  pageId: string;
  accessToken: string;
  graphBaseUrl?: string;
  uploadBaseUrl?: string;
  fetch?: typeof fetch;
}

function reelUrl(videoId: string): string {
  return `https://www.facebook.com/reel/${videoId}`;
}

/** Facebook Page Reels on Graph v25.0; outcomes are raw so core owns the transitions. */
export class FacebookDestination implements Destination {
  readonly capabilities = FACEBOOK_CAPABILITIES;
  #pageId: string;
  #accessToken: string;
  #graphBaseUrl: string;
  #uploadBaseUrl: string;
  #fetch: typeof fetch;

  constructor(options: FacebookAdapterOptions) {
    if (!options.pageId || !options.accessToken) throw new Error('CHANNEL_NOT_CONNECTED');
    this.#pageId = options.pageId;
    this.#accessToken = options.accessToken;
    this.#graphBaseUrl = options.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL;
    this.#uploadBaseUrl = options.uploadBaseUrl ?? DEFAULT_UPLOAD_BASE_URL;
    this.#fetch = options.fetch ?? fetch;
  }

  preflight(post: Post, media: PublicationMedia, now: number): NamedProblem[] {
    return facebookPreflight(post, media, now);
  }

  #reelsUrl(): string {
    return `${this.#graphBaseUrl}/${GRAPH_VERSION}/${this.#pageId}/video_reels`;
  }

  async begin(_post: Post, credentials: DestinationCredentials): Promise<{ remote_ref: string }> {
    const body = new URLSearchParams({
      upload_phase: 'start',
      access_token: credentials.access_token,
    });
    const response = await this.#fetch(this.#reelsUrl(), { method: 'POST', body });
    if (!response.ok) throw new Error(await readGraphError(response));
    const payload = (await response.json().catch(() => null)) as { video_id?: unknown } | null;
    if (payload?.video_id === undefined || payload.video_id === null)
      throw new Error('INVALID_GRAPH_RESPONSE');
    return { remote_ref: String(payload.video_id) };
  }

  async upload(
    remote_ref: string,
    file: UploadSource,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const offset = file.offset ?? 0;
    let sent = 0;
    const source = createReadStream(file.path, { start: offset });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        source.on('data', (chunk) => {
          const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
          sent += bytes.length;
          controller.enqueue(bytes);
          onProgress(file.size_bytes > 0 ? Math.min(1, (offset + sent) / file.size_bytes) : 1);
        });
        source.on('end', () => controller.close());
        source.on('error', (error) => controller.error(error));
      },
      cancel() {
        source.destroy();
      },
    });
    const response = await this.#fetch(`${this.#uploadBaseUrl}/${GRAPH_VERSION}/${remote_ref}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${this.#accessToken}`,
        offset: String(offset),
        file_size: String(file.size_bytes),
        'Content-Type': 'application/octet-stream',
      },
      body: stream,
      signal,
      duplex: 'half',
    } as RequestInit);
    if (!response.ok) throw new Error(await readGraphError(response));
    onProgress(1);
  }

  async submit(remote_ref: string, post: Post, plan: PostPlan | null): Promise<SubmitOutcome> {
    const caption = composeCaption(post, this.capabilities);
    const body = new URLSearchParams({
      upload_phase: 'finish',
      video_id: remote_ref,
      video_state: plan ? 'SCHEDULED' : 'PUBLISHED',
      description: caption.body,
      title: caption.title,
      access_token: this.#accessToken,
    });
    if (plan) body.set('scheduled_publish_time', String(Math.floor(plan.instant / 1000)));
    const response = await this.#fetch(this.#reelsUrl(), { method: 'POST', body });
    if (!response.ok) {
      // Only a definite refusal proves nothing was created; a 5xx/timeout/unmapped code is unknown
      // and must be reconciled, never retried.
      const failure = await parseGraphFailure(response);
      return failure.definite
        ? { kind: 'failed', error: failure.named }
        : { kind: 'unknown', error: failure.named };
    }
    if (plan)
      return {
        kind: 'scheduled',
        scheduled_for: plan.instant,
        remote_post_id: remote_ref,
        remote_url: reelUrl(remote_ref),
      };
    return { kind: 'published', remote_post_id: remote_ref, remote_url: reelUrl(remote_ref) };
  }

  async reconcile(
    remote_ref: string,
    credentials: DestinationCredentials,
    _now: number,
  ): Promise<ReconcileOutcome> {
    const query = new URLSearchParams({ fields: 'status', access_token: credentials.access_token });
    const response = await this.#fetch(
      `${this.#graphBaseUrl}/${GRAPH_VERSION}/${remote_ref}?${query}`,
    );
    if (!response.ok) return { kind: 'unknown', error: await readGraphError(response) };
    const payload = (await response.json().catch(() => null)) as {
      status?: { publish_status?: unknown };
    } | null;
    const publishStatus = payload?.status?.publish_status;
    if (publishStatus === 'published')
      return { kind: 'published', remote_post_id: remote_ref, remote_url: reelUrl(remote_ref) };
    if (publishStatus === 'scheduled')
      return {
        kind: 'scheduled',
        scheduled_for: null,
        remote_post_id: remote_ref,
        remote_url: reelUrl(remote_ref),
      };
    if (publishStatus === 'error') return { kind: 'failed', error: 'PUBLISH_FAILED' };
    return { kind: 'unknown', error: null };
  }
}
