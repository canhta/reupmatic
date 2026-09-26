import type { Post } from '../../../core/distribution/distribution-contracts.js';
import type {
  DestinationCredentials,
  Publication,
  PublicationMedia,
  ReconcileOutcome,
  SubmitOutcome,
} from '../../../core/distribution/publishing/contracts.js';
import {
  canStartAttempt,
  markFailed,
  markPublished,
  markScheduled,
  markSubmitted,
  markUnknown,
  startAttempt,
} from '../../../core/distribution/publishing/publication.js';
import { FacebookDestination } from './facebook-adapter.js';

export interface PublishRunnerOptions {
  graphBaseUrl: string;
  uploadBaseUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface PublishInput {
  post: Post;
  attempt_id: string;
  credentials: DestinationCredentials;
  media: PublicationMedia;
  persist(publication: Publication): void;
  onProgress(fraction: number): void;
}

export interface ReconcileInput {
  post: Post;
  credentials: DestinationCredentials;
  persist(publication: Publication): void;
}

function errorCode(error: unknown): string {
  return error instanceof Error && /^[A-Z_]+$/.test(error.message)
    ? error.message
    : 'PUBLISH_FAILED';
}

export class PublishRunner {
  #graphBaseUrl: string;
  #uploadBaseUrl: string;
  #fetch: typeof fetch;
  #now: () => number;
  // One in-flight publish per post; a concurrent second call must never reach begin().
  #inFlight = new Set<string>();

  constructor(options: PublishRunnerOptions) {
    this.#graphBaseUrl = options.graphBaseUrl;
    this.#uploadBaseUrl = options.uploadBaseUrl;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  #adapter(credentials: DestinationCredentials): FacebookDestination {
    return new FacebookDestination({
      pageId: credentials.account_id,
      accessToken: credentials.access_token,
      graphBaseUrl: this.#graphBaseUrl,
      uploadBaseUrl: this.#uploadBaseUrl,
      fetch: this.#fetch,
    });
  }

  async publish(input: PublishInput): Promise<Publication> {
    const postId = input.post.id;
    if (this.#inFlight.has(postId)) throw new Error('PUBLISH_IN_PROGRESS');
    this.#inFlight.add(postId);
    try {
      if (!canStartAttempt(input.post.publication))
        throw new Error('PUBLICATION_ALREADY_ATTEMPTED');
      const adapter = this.#adapter(input.credentials);
      const { remote_ref } = await adapter.begin(input.post, input.credentials);
      let publication = startAttempt(input.post.publication, {
        attempt_id: input.attempt_id,
        remote_ref,
        now: this.#now(),
      });
      // The platform reference is durable before any byte is uploaded.
      input.persist(publication);
      try {
        await adapter.upload(
          remote_ref,
          { path: input.post.export.path, size_bytes: input.media.size_bytes },
          input.onProgress,
        );
      } catch (error) {
        const code = errorCode(error);
        publication = markFailed(publication, { error: code }, this.#now());
        input.persist(publication);
        throw new Error(code);
      }
      // Persist submitted before the one call that can create a post; an interrupted finish is only
      // ever reconciled.
      publication = markSubmitted(publication, this.#now());
      input.persist(publication);
      try {
        const outcome = await adapter.submit(remote_ref, input.post, input.post.planned);
        publication = this.#applySubmit(publication, outcome);
      } catch (error) {
        publication = markUnknown(publication, { error: errorCode(error) }, this.#now());
      }
      input.persist(publication);
      return publication;
    } finally {
      this.#inFlight.delete(postId);
    }
  }

  async reconcile(input: ReconcileInput): Promise<Publication> {
    const current = input.post.publication;
    if (!current) throw new Error('PUBLICATION_MISSING');
    if (current.phase === 'published' || current.phase === 'failed') return current;
    const adapter = this.#adapter(input.credentials);
    const outcome = await adapter.reconcile(current.remote_ref, input.credentials, this.#now());
    const next = this.#applyReconcile(current, outcome);
    if (next !== current) input.persist(next);
    return next;
  }

  #applySubmit(publication: Publication, outcome: SubmitOutcome): Publication {
    const now = this.#now();
    if (outcome.kind === 'scheduled')
      return markScheduled(
        publication,
        {
          scheduled_for: outcome.scheduled_for,
          remote_post_id: outcome.remote_post_id,
          remote_url: outcome.remote_url,
        },
        now,
      );
    if (outcome.kind === 'published')
      return markPublished(
        publication,
        { remote_post_id: outcome.remote_post_id, remote_url: outcome.remote_url },
        now,
      );
    return markFailed(publication, { error: outcome.error }, now);
  }

  #applyReconcile(current: Publication, outcome: ReconcileOutcome): Publication {
    const now = this.#now();
    if (outcome.kind === 'published')
      return markPublished(
        current,
        { remote_post_id: outcome.remote_post_id, remote_url: outcome.remote_url },
        now,
      );
    if (outcome.kind === 'scheduled') {
      if (current.phase === 'scheduled') return current;
      return markScheduled(
        current,
        {
          scheduled_for: outcome.scheduled_for ?? current.scheduled_for ?? now,
          remote_post_id: outcome.remote_post_id,
          remote_url: outcome.remote_url,
        },
        now,
      );
    }
    if (outcome.kind === 'failed') return markFailed(current, { error: outcome.error }, now);
    if (current.phase === 'unknown' && outcome.error === current.error) return current;
    return markUnknown(current, { error: outcome.error }, now);
  }
}
