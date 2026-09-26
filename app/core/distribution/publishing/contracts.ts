import type { Post, PostPlan } from '../distribution-contracts.js';

// The destination seam shared by every publishing platform; YouTube and TikTok implement it later.
export type Platform = 'facebook_page' | 'youtube' | 'tiktok';

export interface DestinationCapabilities {
  native_schedule: { min_lead_ms: number; max_lead_ms: number } | null;
  media: {
    min_ms: number;
    max_ms: number;
    min_width: number;
    min_height: number;
    max_bytes: number;
    aspect: { width: number; height: number; tolerance: number } | 'any';
  };
  caption: { title_max: number | null; body_max: number };
}

export const PUBLICATION_PHASES = [
  'uploading',
  'submitted',
  'scheduled',
  'published',
  'failed',
  'unknown',
] as const;
export type PublicationPhase = (typeof PUBLICATION_PHASES)[number];

// The privacy the platform actually granted; YouTube forces private for unverified projects, so the
// outcome must report this rather than repeat what was requested.
export type PublicationPrivacy = 'public' | 'private' | 'unlisted';

export interface Publication {
  attempt_id: string;
  phase: PublicationPhase;
  remote_ref: string;
  remote_post_id: string | null;
  remote_url: string | null;
  scheduled_for: number | null;
  privacy: PublicationPrivacy | null;
  error: string | null;
  updated_at: number;
}

export const PUBLISH_PROBLEM_CODES = [
  'PUBLISH_MEDIA_TOO_SHORT',
  'PUBLISH_MEDIA_TOO_LONG',
  'PUBLISH_MEDIA_RESOLUTION',
  'PUBLISH_MEDIA_ASPECT',
  'PUBLISH_MEDIA_TOO_LARGE',
  'PUBLISH_SCHEDULE_TOO_SOON',
  'PUBLISH_SCHEDULE_TOO_FAR',
  'PUBLISH_CAPTION_CLIPPED',
] as const;
export type PublishProblemCode = (typeof PUBLISH_PROBLEM_CODES)[number];
export interface NamedProblem {
  code: PublishProblemCode;
  severity: 'blocking' | 'warning';
}

export interface PublicationMedia {
  duration_ms: number;
  width: number;
  height: number;
  size_bytes: number;
}

export interface UploadSource {
  path: string;
  size_bytes: number;
  offset?: number;
}

export interface DestinationCredentials {
  account_id: string;
  access_token: string;
}

// YouTube's per-post choices: made-for-kids is required by YouTube with no default; synthetic-media
// disclosure is the creator's to make. Other platforms carry no options yet.
export interface YouTubeOptions {
  self_declared_made_for_kids: boolean;
  contains_synthetic_media: boolean;
}
export interface PostOptions {
  youtube: YouTubeOptions | null;
}

export type SubmitOutcome =
  | {
      kind: 'scheduled';
      remote_post_id: string | null;
      remote_url: string | null;
      scheduled_for: number;
      privacy: PublicationPrivacy | null;
    }
  | {
      kind: 'published';
      remote_post_id: string | null;
      remote_url: string | null;
      privacy: PublicationPrivacy | null;
    }
  | { kind: 'failed'; error: string }
  // The create call may have landed; only a definite refusal proves otherwise.
  | { kind: 'unknown'; error: string };

export type ReconcileOutcome =
  | {
      kind: 'scheduled';
      remote_post_id: string | null;
      remote_url: string | null;
      scheduled_for: number | null;
      privacy: PublicationPrivacy | null;
    }
  | {
      kind: 'published';
      remote_post_id: string | null;
      remote_url: string | null;
      privacy: PublicationPrivacy | null;
    }
  | { kind: 'failed'; error: string }
  | { kind: 'unknown'; error: string | null };

// Adapters return platform outcomes; the host applies the core transition functions so an adapter
// cannot skip the never-publish-twice policy.
export interface Destination {
  readonly capabilities: DestinationCapabilities;
  preflight(post: Post, media: PublicationMedia, now: number): NamedProblem[];
  begin(post: Post, credentials: DestinationCredentials): Promise<{ remote_ref: string }>;
  upload(
    remote_ref: string,
    file: UploadSource,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  submit(remote_ref: string, post: Post, plan: PostPlan | null): Promise<SubmitOutcome>;
  reconcile(
    remote_ref: string,
    post: Post,
    credentials: DestinationCredentials,
    now: number,
  ): Promise<ReconcileOutcome>;
}
