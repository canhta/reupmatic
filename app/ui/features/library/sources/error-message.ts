import type { DouyinFailureKind } from '../../../../core/sources/douyin-discovery-contracts';
import type { MessageKey } from '../../../locales/message-key';

const errors: Record<string, MessageKey> = {
  DOUYIN_SESSION_UNAVAILABLE: 'downloadsSessionUnavailable',
  DOUYIN_SESSION_VERSION: 'downloadsSessionUnavailable',
  DOUYIN_COOKIES_UNREADABLE: 'downloadsCookiesUnreadable',
  DOUYIN_COOKIES_MISSING_IDENTITY: 'downloadsCookiesMissingIdentity',
};

export const douyinErrorKey = (code: string): MessageKey => errors[code] ?? 'downloadsSessionError';

const failureMessages: Record<DouyinFailureKind, MessageKey> = {
  rate_limited: 'douyinSearchFailureRateLimited',
  login_required: 'douyinSearchFailureLoginRequired',
  verification_required: 'douyinSearchFailureVerificationRequired',
  timeout: 'douyinSearchFailureTimeout',
  page_load_failed: 'douyinSearchFailurePageLoad',
  malformed: 'douyinSearchFailureMalformed',
  rejected: 'douyinSearchFailureRejected',
};

export const douyinFailureKey = (kind: DouyinFailureKind): MessageKey => failureMessages[kind];
