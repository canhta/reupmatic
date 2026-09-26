import { open, stat } from 'node:fs/promises';
import type { Post } from '../../../core/distribution/distribution-contracts.js';
import { composeCaption } from '../../../core/distribution/publishing/caption.js';
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
  YOUTUBE_CAPABILITIES,
  youtubePreflight,
} from '../../../core/distribution/publishing/youtube.js';
import { type PublishingDiagnostics, publishingDiagnostics } from './diagnostics.js';
import { errorCodeOf, isDefiniteRefusal, publishError } from './publishing-error.js';

export const YOUTUBE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos';

// Google requires resumable chunks to be a multiple of 256 KB except the last.
const DEFAULT_CHUNK_BYTES = 8 * 1024 * 1024;

interface YouTubeAdapterOptions {
  fetchImpl?: typeof fetch;
  uploadEndpoint?: string;
  chunkBytes?: number;
  diagnostics?: PublishingDiagnostics;
}

interface ResumableStatus {
  offset: number;
  video: Record<string, unknown> | null;
}

function readPrivacy(value: unknown): PublicationPrivacy | null {
  return value === 'public' || value === 'private' || value === 'unlisted' ? value : null;
}

/**
 * YouTube data API v3 destination. A resumable session URI is the remote_ref persisted before any
 * byte is sent; upload completion creates the video, so an interruption is never followed by a
 * second insert — it is queried back through the same session.
 */
export class YouTubeDestination implements Destination {
  readonly capabilities = YOUTUBE_CAPABILITIES;
  #fetch: typeof fetch;
  #uploadEndpoint: string;
  #chunkBytes: number;
  #diagnostics: PublishingDiagnostics;
  #completed = new Map<string, Record<string, unknown>>();

  constructor(options: YouTubeAdapterOptions = {}) {
    this.#fetch = options.fetchImpl ?? fetch;
    this.#uploadEndpoint = options.uploadEndpoint ?? YOUTUBE_UPLOAD_ENDPOINT;
    this.#chunkBytes = options.chunkBytes ?? DEFAULT_CHUNK_BYTES;
    this.#diagnostics = options.diagnostics ?? publishingDiagnostics(undefined);
  }

  preflight(post: Post, media: PublicationMedia, now: number): NamedProblem[] {
    return youtubePreflight(post, media, now);
  }

  async #request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.#fetch(url, init);
    } catch (error) {
      throw publishError(
        error instanceof Error && error.name === 'AbortError'
          ? 'PUBLISH_ABORTED'
          : 'PUBLISH_TRANSPORT',
      );
    }
  }

  async #failure(response: Response): Promise<Error> {
    const status = response.status;
    let reason: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: { errors?: { reason?: string }[] };
      };
      reason = body.error?.errors?.[0]?.reason;
    } catch {
      reason = undefined;
    }
    if (status === 401) return publishError('CHANNEL_REAUTHORIZE', { definite: true });
    if (
      status === 429 ||
      (status === 403 &&
        (reason === 'quotaExceeded' ||
          reason === 'uploadLimitExceeded' ||
          reason === 'rateLimitExceeded' ||
          reason === 'userRateLimitExceeded'))
    )
      return publishError('PUBLISH_RATE_LIMITED', { definite: true });
    // 5xx, timeouts, unparseable bodies and unmapped refusals are ambiguous: the create may have
    // landed, so the host must reconcile rather than mark failed.
    return publishError('PUBLISH_UNKNOWN');
  }

  async begin(post: Post, credentials: DestinationCredentials): Promise<{ remote_ref: string }> {
    const options = post.options.youtube;
    if (!options) throw publishError('PUBLISH_OPTIONS_REQUIRED');
    const caption = composeCaption(post, this.capabilities);
    const status: Record<string, unknown> = {
      privacyStatus: post.planned !== null ? 'private' : 'public',
      selfDeclaredMadeForKids: options.self_declared_made_for_kids,
      containsSyntheticMedia: options.contains_synthetic_media,
    };
    if (post.planned !== null) status.publishAt = new Date(post.planned.instant).toISOString();
    let size: number;
    try {
      size = (await stat(post.export.path)).size;
    } catch {
      throw publishError('SOURCE_UNAVAILABLE');
    }
    const url = new URL(this.#uploadEndpoint);
    url.searchParams.set('uploadType', 'resumable');
    url.searchParams.set('part', 'snippet,status');
    const response = await this.#request(url.href, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credentials.access_token}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(size),
        'x-upload-content-type': 'video/*',
      },
      body: JSON.stringify({
        snippet: { title: caption.title, description: caption.body },
        status,
      }),
    });
    if (!response.ok) throw await this.#failure(response);
    const location = response.headers.get('location');
    if (!location) throw publishError('PUBLISH_UNKNOWN');
    this.#diagnostics.event('youtube.session', {
      privacy: status.privacyStatus as string,
      scheduled: post.planned !== null,
      bytes: size,
    });
    return { remote_ref: new URL(location, this.#uploadEndpoint).href };
  }

  async #sessionStatus(
    remoteRef: string,
    size: number,
    signal?: AbortSignal,
  ): Promise<ResumableStatus> {
    const response = await this.#request(remoteRef, {
      method: 'PUT',
      headers: { 'content-length': '0', 'content-range': `bytes */${size}` },
      signal,
    });
    if (response.status === 308) {
      const range = response.headers.get('range');
      const offset = range ? Number(range.split('-')[1]) + 1 : 0;
      return { offset: Number.isFinite(offset) && offset >= 0 ? offset : 0, video: null };
    }
    if (response.ok) {
      try {
        return { offset: size, video: (await response.json()) as Record<string, unknown> };
      } catch {
        throw publishError('PUBLISH_UNKNOWN');
      }
    }
    if (response.status === 404 || response.status === 410) throw publishError('PUBLISH_UNKNOWN');
    throw await this.#failure(response);
  }

  async upload(
    remoteRef: string,
    file: UploadSource,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const initial = await this.#sessionStatus(remoteRef, file.size_bytes, signal);
    if (initial.video) {
      this.#completed.set(remoteRef, initial.video);
      onProgress(1);
      return;
    }
    let offset = initial.offset;
    if (offset >= file.size_bytes) {
      onProgress(1);
      return;
    }
    const handle = await open(file.path, 'r');
    try {
      while (offset < file.size_bytes) {
        const end = Math.min(offset + this.#chunkBytes, file.size_bytes) - 1;
        const length = end - offset + 1;
        const buffer = Buffer.allocUnsafe(length);
        await handle.read(buffer, 0, length, offset);
        const response = await this.#request(remoteRef, {
          method: 'PUT',
          headers: {
            'content-length': String(length),
            'content-range': `bytes ${offset}-${end}/${file.size_bytes}`,
          },
          body: buffer,
          signal,
        });
        if (response.status === 308) {
          const range = response.headers.get('range');
          const next = range ? Number(range.split('-')[1]) + 1 : offset + length;
          offset = Number.isFinite(next) && next > offset ? next : offset + length;
          onProgress(Math.min(1, offset / file.size_bytes));
          continue;
        }
        if (response.ok) {
          let video: Record<string, unknown>;
          try {
            video = (await response.json()) as Record<string, unknown>;
          } catch {
            throw publishError('PUBLISH_UNKNOWN');
          }
          this.#completed.set(remoteRef, video);
          onProgress(1);
          this.#diagnostics.event('youtube.upload', {
            bytes: file.size_bytes,
            resumed_from: initial.offset,
          });
          return;
        }
        throw await this.#failure(response);
      }
    } finally {
      await handle.close();
    }
  }

  #outcome(post: Post, video: Record<string, unknown>): SubmitOutcome {
    const remotePostId = typeof video.id === 'string' && video.id ? video.id : null;
    const status = video.status as { privacyStatus?: unknown } | undefined;
    const privacy = readPrivacy(status?.privacyStatus);
    const remoteUrl = remotePostId ? `https://www.youtube.com/watch?v=${remotePostId}` : null;
    if (post.planned !== null)
      return {
        kind: 'scheduled',
        scheduled_for: post.planned.instant,
        remote_post_id: remotePostId,
        remote_url: remoteUrl,
        privacy,
      };
    return { kind: 'published', remote_post_id: remotePostId, remote_url: remoteUrl, privacy };
  }

  async submit(remoteRef: string, post: Post, _plan: Post['planned']): Promise<SubmitOutcome> {
    const video = this.#completed.get(remoteRef);
    // The create call may already have landed; an absent result is unknown, never "failed".
    if (!video) return { kind: 'unknown', error: 'PUBLISH_UNKNOWN' };
    this.#completed.delete(remoteRef);
    const outcome = this.#outcome(post, video);
    const created = outcome.kind === 'scheduled' || outcome.kind === 'published' ? outcome : null;
    this.#diagnostics.event('youtube.submit', {
      kind: outcome.kind,
      privacy: created?.privacy ?? null,
      video: created?.remote_post_id ?? null,
    });
    return outcome;
  }

  async reconcile(
    remoteRef: string,
    post: Post,
    _credentials: DestinationCredentials,
    _now: number,
  ): Promise<ReconcileOutcome> {
    let size: number;
    try {
      size = (await stat(post.export.path)).size;
    } catch {
      return { kind: 'unknown', error: 'PUBLISH_UNKNOWN' };
    }
    let status: ResumableStatus;
    try {
      status = await this.#sessionStatus(remoteRef, size);
    } catch (error) {
      if (isDefiniteRefusal(error)) throw error;
      const code = errorCodeOf(error);
      this.#diagnostics.event('youtube.reconcile', { kind: 'error', code }, { level: 'warn' });
      return { kind: 'unknown', error: code };
    }
    if (status.video) {
      const outcome = this.#outcome(post, status.video);
      this.#diagnostics.event('youtube.reconcile', {
        kind: outcome.kind,
        privacy:
          outcome.kind === 'scheduled' || outcome.kind === 'published' ? outcome.privacy : null,
      });
      return outcome;
    }
    // 308: bytes incomplete, no video exists — safe to report as a definite failure so a retry is
    // allowed; a retired session (404/410) stays unknown so nothing is re-inserted.
    this.#diagnostics.event('youtube.reconcile', { kind: 'incomplete' });
    return { kind: 'failed', error: 'PUBLISH_INCOMPLETE' };
  }
}
