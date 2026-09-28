import { classifyDouyinResponse, mapDouyinDetail } from '../../../core/sources/douyin-discovery.js';
import type {
  DouyinDetail,
  DouyinOutcome,
} from '../../../core/sources/douyin-discovery-contracts.js';
import { type SourcesDiagnostics, sourcesDiagnostics } from './diagnostics.js';

// Douyin's mobile app endpoint: answers plain requests without the Argus web gate.
const MOBILE_DETAIL_URL = 'https://aweme.snssdk.com/aweme/v1/aweme/detail/';
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const REQUEST_TIMEOUT_MS = 20_000;

export interface MobileDetailCredentials {
  cookies: readonly { name: string; value: string }[];
}

function cookieHeader(cookies: MobileDetailCredentials['cookies']): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function fetchDouyinMobileDetail(
  awemeId: string,
  credentials: MobileDetailCredentials,
  capturedAt: number,
  diagnostics: SourcesDiagnostics = sourcesDiagnostics(undefined),
): Promise<DouyinOutcome<DouyinDetail>> {
  const url = `${MOBILE_DETAIL_URL}?aweme_id=${encodeURIComponent(awemeId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': MOBILE_USER_AGENT,
        referer: 'https://www.douyin.com/',
        // Sent only as a request header; never logged, returned or persisted.
        cookie: cookieHeader(credentials.cookies),
      },
    });
    const body = await response.text();
    diagnostics.event(
      'mobile-detail',
      { status: response.status, bytes: body.length },
      { level: 'debug' },
    );
    const classified = classifyDouyinResponse({
      path: '/aweme/v1/aweme/detail/',
      httpStatus: response.status,
      body,
    });
    if (!classified.ok) return classified;
    return mapDouyinDetail(classified.value, capturedAt);
  } catch (error) {
    const code = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network';
    diagnostics.event('mobile-detail.error', { code }, { level: 'warn' });
    return {
      ok: false,
      failure: {
        kind: code === 'timeout' ? 'timeout' : 'page_load_failed',
        retryable: true,
        statusCode: null,
        statusMessage: null,
        httpStatus: null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
