import type { Post } from '../distribution-contracts.js';
import { composeCaption } from './caption.js';
import type {
  DestinationCapabilities,
  NamedProblem,
  PublicationMedia,
  PublishProblemCode,
} from './contracts.js';

// Verified against Meta's Reels publishing guide and graph error codes (see ADR 0001):
// duration 3–90 s, 9:16, minimum 540×960, schedule > 10 min and ≤ 29 days, video ≤ 2 GB.
export const FACEBOOK_CAPABILITIES: DestinationCapabilities = {
  native_schedule: { min_lead_ms: 10 * 60 * 1000, max_lead_ms: 29 * 24 * 60 * 60 * 1000 },
  media: {
    min_ms: 3_000,
    max_ms: 90_000,
    min_width: 540,
    min_height: 960,
    max_bytes: 2 * 1024 * 1024 * 1024,
    aspect: { width: 9, height: 16, tolerance: 0.02 },
  },
  caption: { title_max: null, body_max: 2200 },
};

function problem(code: PublishProblemCode, severity: NamedProblem['severity'] = 'blocking') {
  return { code, severity } satisfies NamedProblem;
}

export function facebookPreflight(
  post: Post,
  media: PublicationMedia,
  now: number,
): NamedProblem[] {
  const capabilities = FACEBOOK_CAPABILITIES;
  const problems: NamedProblem[] = [];
  if (media.duration_ms < capabilities.media.min_ms)
    problems.push(problem('PUBLISH_MEDIA_TOO_SHORT'));
  if (media.duration_ms > capabilities.media.max_ms)
    problems.push(problem('PUBLISH_MEDIA_TOO_LONG'));
  if (media.width < capabilities.media.min_width || media.height < capabilities.media.min_height)
    problems.push(problem('PUBLISH_MEDIA_RESOLUTION'));
  const aspect = capabilities.media.aspect;
  if (
    aspect !== 'any' &&
    Math.abs(media.width / media.height - aspect.width / aspect.height) > aspect.tolerance
  )
    problems.push(problem('PUBLISH_MEDIA_ASPECT'));
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
