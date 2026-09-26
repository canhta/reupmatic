import type { Platform, Post } from '../../../core/distribution/distribution-contracts.js';
import type {
  Destination,
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
import { errorCodeOf, isDefiniteRefusal } from './publishing-error.js';

export interface PublishingServiceOptions {
  /**
   * Builds the platform adapter for one attempt; the service itself stays platform-agnostic. The
   * media is provided at publish time (TikTok's init needs the size) and is null for reconcile.
   */
  destinationFor(
    platform: Platform,
    credentials: DestinationCredentials,
    media: PublicationMedia | null,
  ): Destination;
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

/**
 * Applies the core never-publish-twice transitions around a platform adapter: the reference is
 * persisted before any byte moves, uploads are serialised per post, and only a definite mapped
 * refusal is `failed` — everything else reconciles.
 */
export class PublishingService {
  #destinationFor: PublishingServiceOptions['destinationFor'];
  #now: () => number;
  // One in-flight publish per post; a concurrent second call must never reach begin().
  #inFlight = new Set<string>();

  constructor(options: PublishingServiceOptions) {
    this.#destinationFor = options.destinationFor;
    this.#now = options.now ?? Date.now;
  }

  async publish(input: PublishInput): Promise<Publication> {
    const postId = input.post.id;
    if (this.#inFlight.has(postId)) throw new Error('PUBLISH_IN_PROGRESS');
    this.#inFlight.add(postId);
    try {
      if (!canStartAttempt(input.post.publication))
        throw new Error('PUBLICATION_ALREADY_ATTEMPTED');
      const destination = this.#destinationFor(
        input.post.channel.platform,
        input.credentials,
        input.media,
      );
      const { remote_ref } = await destination.begin(input.post, input.credentials);
      let publication = startAttempt(input.post.publication, {
        attempt_id: input.attempt_id,
        remote_ref,
        now: this.#now(),
      });
      // The platform reference is durable before any byte is uploaded.
      input.persist(publication);
      try {
        await destination.upload(
          remote_ref,
          { path: input.post.export.path, size_bytes: input.media.size_bytes },
          input.onProgress,
        );
      } catch (error) {
        const code = errorCodeOf(error);
        if (isDefiniteRefusal(error)) {
          // A mapped 4xx refusal proves nothing was created, so the user may retry.
          publication = markFailed(publication, { error: code }, this.#now());
          input.persist(publication);
          throw new Error(code);
        }
        // 5xx, timeout, unparseable body or unmapped code: the create may have landed.
        publication = markUnknown(publication, { error: code }, this.#now());
        input.persist(publication);
        return publication;
      }
      // Persist submitted before the call that can create a post; an interrupted create is only
      // ever reconciled.
      publication = markSubmitted(publication, this.#now());
      input.persist(publication);
      try {
        const outcome = await destination.submit(remote_ref, input.post, input.post.planned);
        publication = this.#applySubmit(publication, outcome);
      } catch (error) {
        publication = markUnknown(publication, { error: errorCodeOf(error) }, this.#now());
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
    const destination = this.#destinationFor(input.post.channel.platform, input.credentials, null);
    const outcome = await destination.reconcile(
      current.remote_ref,
      input.post,
      input.credentials,
      this.#now(),
    );
    const next = this.#applyReconcile(current, outcome, destination.upload_publishes === true);
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
          privacy: outcome.privacy,
        },
        now,
      );
    if (outcome.kind === 'published')
      return markPublished(
        publication,
        {
          remote_post_id: outcome.remote_post_id,
          remote_url: outcome.remote_url,
          privacy: outcome.privacy,
        },
        now,
      );
    // Already persisted as submitted; the platform is still processing.
    if (outcome.kind === 'submitted') return publication;
    if (outcome.kind === 'unknown') return markUnknown(publication, { error: outcome.error }, now);
    return markFailed(publication, { error: outcome.error }, now);
  }

  #applyReconcile(
    current: Publication,
    outcome: ReconcileOutcome,
    uploadPublishes: boolean,
  ): Publication {
    const now = this.#now();
    if (current.phase === 'uploading') {
      if (outcome.kind === 'published')
        return markPublished(
          markSubmitted(current, now),
          {
            remote_post_id: outcome.remote_post_id,
            remote_url: outcome.remote_url,
            privacy: outcome.privacy,
          },
          now,
        );
      if (outcome.kind === 'scheduled')
        return markScheduled(
          markSubmitted(current, now),
          {
            scheduled_for: outcome.scheduled_for ?? current.scheduled_for ?? now,
            remote_post_id: outcome.remote_post_id,
            remote_url: outcome.remote_url,
            privacy: outcome.privacy,
          },
          now,
        );
      if (uploadPublishes) {
        // Upload completion creates the post, so a still-processing or ambiguous outcome may
        // already be public: reconcile again rather than mark it retryable.
        if (outcome.kind === 'submitted') return markSubmitted(current, now);
        if (outcome.kind === 'unknown') return markUnknown(current, { error: outcome.error }, now);
        if (outcome.kind === 'failed') return markFailed(current, { error: outcome.error }, now);
      }
      // An upload that never reached submit cannot have created a post: anything but a confirmed
      // publish/schedule is a definite interruption, so the user can retry instead of being stuck.
      return markFailed(current, { error: 'PUBLISH_UPLOAD_INTERRUPTED' }, now);
    }
    if (outcome.kind === 'published')
      return markPublished(
        current,
        {
          remote_post_id: outcome.remote_post_id,
          remote_url: outcome.remote_url,
          privacy: outcome.privacy,
        },
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
          privacy: outcome.privacy,
        },
        now,
      );
    }
    if (outcome.kind === 'submitted') {
      if (current.phase === 'submitted' || current.phase === 'unknown') return current;
      return markSubmitted(current, now);
    }
    if (outcome.kind === 'failed') return markFailed(current, { error: outcome.error }, now);
    if (current.phase === 'unknown' && outcome.error === current.error) return current;
    return markUnknown(current, { error: outcome.error }, now);
  }
}
