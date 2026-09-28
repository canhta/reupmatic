import type { Publication, PublicationPhase, PublicationPrivacy } from './contracts.js';

const ALLOWED_TRANSITIONS: Record<PublicationPhase, readonly PublicationPhase[]> = {
  uploading: ['submitted', 'failed', 'unknown'],
  submitted: ['scheduled', 'published', 'failed', 'unknown'],
  scheduled: ['published', 'failed', 'unknown'],
  unknown: ['scheduled', 'published', 'failed'],
  published: [],
  failed: [],
};

// A new attempt is allowed only from nothing or a definite failure; anything past that is
// reconciled, never re-created.
export function canStartAttempt(publication: Publication | null): boolean {
  return publication === null || publication.phase === 'failed';
}

export function startAttempt(
  previous: Publication | null,
  input: { attempt_id: string; remote_ref: string; now: number },
): Publication {
  if (!canStartAttempt(previous)) throw new Error('PUBLICATION_ALREADY_ATTEMPTED');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(input.attempt_id)) throw new Error('INVALID_REQUEST');
  // Google's resumable session URIs exceed 512 characters.
  if (!input.remote_ref || input.remote_ref.length > 4096) throw new Error('INVALID_REQUEST');
  return {
    attempt_id: input.attempt_id,
    phase: 'uploading',
    remote_ref: input.remote_ref,
    remote_post_id: null,
    remote_url: null,
    scheduled_for: null,
    privacy: null,
    error: null,
    updated_at: input.now,
  };
}

export function advance(
  current: Publication,
  phase: PublicationPhase,
  patch: Partial<Omit<Publication, 'attempt_id' | 'remote_ref' | 'phase' | 'updated_at'>>,
  now: number,
): Publication {
  if (!ALLOWED_TRANSITIONS[current.phase].includes(phase))
    throw new Error('PUBLICATION_TRANSITION');
  return {
    ...current,
    ...patch,
    phase,
    updated_at: now,
  };
}

export function markSubmitted(publication: Publication, now: number): Publication {
  return advance(publication, 'submitted', {}, now);
}

export function markScheduled(
  publication: Publication,
  input: {
    scheduled_for: number;
    remote_post_id: string | null;
    remote_url: string | null;
    privacy?: PublicationPrivacy | null;
  },
  now: number,
): Publication {
  return advance(publication, 'scheduled', { ...input, privacy: input.privacy ?? null }, now);
}

export function markPublished(
  publication: Publication,
  input: {
    remote_post_id: string | null;
    remote_url: string | null;
    privacy?: PublicationPrivacy | null;
  },
  now: number,
): Publication {
  return advance(publication, 'published', { ...input, privacy: input.privacy ?? null }, now);
}

export function markFailed(
  publication: Publication,
  input: { error: string },
  now: number,
): Publication {
  return advance(publication, 'failed', { error: input.error }, now);
}

export function markUnknown(
  publication: Publication,
  input: { error: string | null },
  now: number,
): Publication {
  return advance(publication, 'unknown', { error: input.error }, now);
}
