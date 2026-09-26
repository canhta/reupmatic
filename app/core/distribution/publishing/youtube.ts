import type { Post } from '../distribution-contracts.js';
import { composeCaption } from './caption.js';
import type {
  DestinationCapabilities,
  NamedProblem,
  PublicationMedia,
  PublishProblemCode,
} from './contracts.js';

// Verified against the Data API v3 videos.insert reference (see ADR 0001):
// uploads up to 256 GB, any aspect (Shorts need no special API), scheduled publishAt is private-only
// and must be in the future, title 100 chars, description 5000.
export const YOUTUBE_CAPABILITIES: DestinationCapabilities = {
  native_schedule: { min_lead_ms: 60 * 1000, max_lead_ms: 365 * 24 * 60 * 60 * 1000 },
  media: {
    min_ms: 1_000,
    max_ms: 12 * 60 * 60 * 1000,
    min_width: 1,
    min_height: 1,
    max_bytes: 256 * 1024 * 1024 * 1024,
    aspect: 'any',
  },
  caption: { title_max: 100, body_max: 5000 },
};

function problem(code: PublishProblemCode, severity: NamedProblem['severity'] = 'blocking') {
  return { code, severity } satisfies NamedProblem;
}

export function youtubePreflight(post: Post, media: PublicationMedia, now: number): NamedProblem[] {
  const capabilities = YOUTUBE_CAPABILITIES;
  const problems: NamedProblem[] = [];
  if (media.duration_ms < capabilities.media.min_ms)
    problems.push(problem('PUBLISH_MEDIA_TOO_SHORT'));
  if (media.duration_ms > capabilities.media.max_ms)
    problems.push(problem('PUBLISH_MEDIA_TOO_LONG'));
  if (media.width < capabilities.media.min_width || media.height < capabilities.media.min_height)
    problems.push(problem('PUBLISH_MEDIA_RESOLUTION'));
  if (media.size_bytes > capabilities.media.max_bytes)
    problems.push(problem('PUBLISH_MEDIA_TOO_LARGE'));
  if (post.planned !== null && capabilities.native_schedule !== null) {
    const { min_lead_ms, max_lead_ms } = capabilities.native_schedule;
    const lead = post.planned.instant - now;
    if (lead <= min_lead_ms) problems.push(problem('PUBLISH_SCHEDULE_TOO_SOON'));
    if (lead > max_lead_ms) problems.push(problem('PUBLISH_SCHEDULE_TOO_FAR'));
  }
  if (composeCaption(post, capabilities).clipped)
    problems.push(problem('PUBLISH_CAPTION_CLIPPED', 'warning'));
  return problems;
}
