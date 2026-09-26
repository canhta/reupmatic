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

function problem(
  code: PublishProblemCode,
  severity: NamedProblem['severity'] = 'blocking',
  params?: Record<string, number>,
) {
  return { code, severity, ...(params ? { params } : {}) } satisfies NamedProblem;
}

export function facebookPreflight(
  post: Post,
  media: PublicationMedia,
  now: number,
): NamedProblem[] {
  const capabilities = FACEBOOK_CAPABILITIES;
  const problems: NamedProblem[] = [];
  if (media.duration_ms < capabilities.media.min_ms)
    problems.push(
      problem('PUBLISH_MEDIA_TOO_SHORT', 'blocking', {
        seconds: capabilities.media.min_ms / 1000,
      }),
    );
  if (media.duration_ms > capabilities.media.max_ms)
    problems.push(
      problem('PUBLISH_MEDIA_TOO_LONG', 'blocking', {
        seconds: capabilities.media.max_ms / 1000,
      }),
    );
  if (media.width < capabilities.media.min_width || media.height < capabilities.media.min_height)
    problems.push(
      problem('PUBLISH_MEDIA_RESOLUTION', 'blocking', {
        min_width: capabilities.media.min_width,
        min_height: capabilities.media.min_height,
      }),
    );
  const aspect = capabilities.media.aspect;
  if (
    aspect !== 'any' &&
    Math.abs(media.width / media.height - aspect.width / aspect.height) > aspect.tolerance
  )
    problems.push(
      problem('PUBLISH_MEDIA_ASPECT', 'blocking', {
        width: aspect.width,
        height: aspect.height,
      }),
    );
  if (media.size_bytes > capabilities.media.max_bytes)
    problems.push(
      problem('PUBLISH_MEDIA_TOO_LARGE', 'blocking', {
        gigabytes: capabilities.media.max_bytes / 1024 ** 3,
      }),
    );
  if (post.planned !== null && capabilities.native_schedule !== null) {
    const { min_lead_ms, max_lead_ms } = capabilities.native_schedule;
    const lead = post.planned.instant - now;
    if (lead <= min_lead_ms)
      problems.push(
        problem('PUBLISH_SCHEDULE_TOO_SOON', 'blocking', { minutes: min_lead_ms / 60000 }),
      );
    if (lead > max_lead_ms)
      problems.push(
        problem('PUBLISH_SCHEDULE_TOO_FAR', 'blocking', { days: max_lead_ms / 86400000 }),
      );
  }
  if (composeCaption(post, capabilities).clipped)
    problems.push(
      problem('PUBLISH_CAPTION_CLIPPED', 'warning', { limit: capabilities.caption.body_max }),
    );
  return problems;
}
