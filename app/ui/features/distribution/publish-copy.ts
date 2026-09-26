import type { PublishProblemCode } from '../../../core/distribution/publishing/contracts';

const PROBLEM_KEYS: Record<PublishProblemCode, string> = {
  PUBLISH_MEDIA_TOO_SHORT: 'publishProblem_PUBLISH_MEDIA_TOO_SHORT',
  PUBLISH_MEDIA_TOO_LONG: 'publishProblem_PUBLISH_MEDIA_TOO_LONG',
  PUBLISH_MEDIA_RESOLUTION: 'publishProblem_PUBLISH_MEDIA_RESOLUTION',
  PUBLISH_MEDIA_ASPECT: 'publishProblem_PUBLISH_MEDIA_ASPECT',
  PUBLISH_MEDIA_TOO_LARGE: 'publishProblem_PUBLISH_MEDIA_TOO_LARGE',
  PUBLISH_SCHEDULE_TOO_SOON: 'publishProblem_PUBLISH_SCHEDULE_TOO_SOON',
  PUBLISH_SCHEDULE_TOO_FAR: 'publishProblem_PUBLISH_SCHEDULE_TOO_FAR',
  PUBLISH_CAPTION_CLIPPED: 'publishProblem_PUBLISH_CAPTION_CLIPPED',
};

export function problemKey(code: PublishProblemCode): string {
  return PROBLEM_KEYS[code];
}

const ERROR_KEYS: Record<string, string> = {
  CHANNEL_NOT_CONNECTED: 'publishError_CHANNEL_NOT_CONNECTED',
  CHANNEL_REAUTHORIZE: 'publishError_CHANNEL_REAUTHORIZE',
  PUBLISH_RATE_LIMITED: 'publishError_PUBLISH_RATE_LIMITED',
  PUBLISH_PERMISSION_DENIED: 'publishError_PUBLISH_PERMISSION_DENIED',
  PUBLISH_INVALID_REQUEST: 'publishError_PUBLISH_INVALID_REQUEST',
  PUBLISHING_NOT_CONFIGURED: 'publishError_PUBLISHING_NOT_CONFIGURED',
  PUBLISH_PLATFORM_UNSUPPORTED: 'publishError_PUBLISH_PLATFORM_UNSUPPORTED',
  PUBLISH_PREFLIGHT_FAILED: 'publishError_PUBLISH_PREFLIGHT_FAILED',
};

export function publishErrorKey(code: string): string {
  return ERROR_KEYS[code] ?? 'publishErrorDefault';
}
