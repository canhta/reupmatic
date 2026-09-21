/**
 * Douyin's web API, called directly — no signature, no page, no browser (D-62).
 * Live evidence: `aweme/post` and `aweme/detail` both answer `200` over plain,
 * unsigned HTTP given only the user's own session cookies and a desktop browser's base query; the
 * web detail's `bit_rate[]` ladder reaches 2160p where the mobile endpoint's tops out far lower
 * (D-60), so the web endpoint is the primary detail path and the mobile one its fallback.
 *
 * This module owns the one place that builds the request and reads the raw response; everything
 * about *what the response means* is core's `classifyDouyinResponse`/`mapDouyinDetail` —
 * mirroring `mobile-detail.ts`'s shape so both first-party hosts are read identically.
 */
import {
  classifyDouyinResponse,
  DOUYIN_DETAIL_PATH,
  DOUYIN_ORIGIN,
  DOUYIN_POST_PATH,
  mapDouyinDetail,
} from '../../../core/sources/douyin-discovery.js';
import type {
  DouyinDetail,
  DouyinFailure,
  DouyinOutcome,
} from '../../../core/sources/douyin-discovery-contracts.js';
import { type SourcesDiagnostics, sourcesDiagnostics } from './diagnostics.js';
import { fetchDouyinMobileDetail } from './mobile-detail.js';

const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 20;

/** A desktop Chrome UA, matching the query below — D-62's live evidence. */
const WEB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const WEB_REFERER = 'https://www.douyin.com/';

/**
 * The web app's own query shape, mirrored from the live evidence rather than the reference
 * project's browser-mimicking one: no `msToken`/`X-Bogus`/`a_bogus`, because none is needed.
 */
const WEB_BASE_QUERY: Record<string, string> = {
  device_platform: 'webapp',
  aid: '6383',
  channel: 'channel_pc_web',
  pc_client_type: '1',
  version_code: '290100',
  version_name: '29.1.0',
  cookie_enabled: 'true',
  platform: 'PC',
  browser_name: 'Chrome',
  browser_version: '139.0.0.0',
  os_name: 'Windows',
  os_version: '10',
  update_version_code: '170400',
};

export interface DouyinWebCredentials {
  cookies: readonly { name: string; value: string }[];
}

function cookieHeader(cookies: DouyinWebCredentials['cookies']): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

/** A transport failure raised before Douyin answered at all — never thrown, always returned, so
 * every caller handles it the same way a classified response is handled. */
function transportFailure(error: unknown): DouyinFailure {
  const timedOut = error instanceof Error && error.name === 'AbortError';
  return {
    kind: timedOut ? 'timeout' : 'page_load_failed',
    // A network hiccup or a slow response is worth one retry; the walk's own backoff bounds it.
    retryable: true,
    statusCode: null,
    statusMessage: null,
    httpStatus: null,
  };
}

/** Issues one GET against `path` with `params`, and returns the classified outcome. The one place
 * that builds the URL, sends the session cookies and reads the raw body. */
async function fetchDouyinWeb(
  path: string,
  params: Record<string, string>,
  credentials: DouyinWebCredentials,
  diagnostics: SourcesDiagnostics,
  event: string,
): Promise<DouyinOutcome<Record<string, unknown>>> {
  const url = new URL(path, DOUYIN_ORIGIN);
  for (const [key, value] of Object.entries({ ...WEB_BASE_QUERY, ...params })) {
    url.searchParams.set(key, value);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': WEB_USER_AGENT,
        referer: WEB_REFERER,
        // Sent only as a request header; never logged, returned or persisted.
        cookie: cookieHeader(credentials.cookies),
      },
    });
    const body = await response.text();
    const classified = classifyDouyinResponse({ path, httpStatus: response.status, body });
    const list =
      classified.ok && Array.isArray(classified.value.aweme_list)
        ? classified.value.aweme_list
        : null;
    const hasMoreValue = classified.ok ? classified.value.has_more : undefined;
    diagnostics.event(
      event,
      {
        status: response.status,
        bytes: body.length,
        kind: classified.ok ? 'ok' : classified.failure.kind,
        items: list ? list.length : null,
        hasMore: hasMoreValue === undefined ? null : hasMoreValue === 1 || hasMoreValue === true,
      },
      { level: classified.ok ? 'debug' : 'warn' },
    );
    return classified;
  } catch (error) {
    const failure = transportFailure(error);
    diagnostics.event(`${event}.error`, { kind: failure.kind }, { level: 'warn' });
    return { ok: false, failure };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches one video's detail through the web endpoint. Primary path (D-62); the caller falls
 * back to the mobile endpoint (D-60) when this fails. */
export async function fetchDouyinWebDetail(
  awemeId: string,
  credentials: DouyinWebCredentials,
  capturedAt: number,
  diagnostics: SourcesDiagnostics = sourcesDiagnostics(undefined),
): Promise<DouyinOutcome<DouyinDetail>> {
  const outcome = await fetchDouyinWeb(
    DOUYIN_DETAIL_PATH,
    { aweme_id: awemeId },
    credentials,
    diagnostics,
    'web-detail',
  );
  if (!outcome.ok) return outcome;
  return mapDouyinDetail(outcome.value, capturedAt);
}

/** Fetches one `aweme/post` page for the channel walk (`douyin-channel-walk.ts`'s injected
 * port). Core owns pagination and the stop rules; this only issues the one request. */
export async function fetchDouyinWebPostPage(
  secUid: string,
  maxCursor: number,
  credentials: DouyinWebCredentials,
  diagnostics: SourcesDiagnostics = sourcesDiagnostics(undefined),
): Promise<DouyinOutcome<Record<string, unknown>>> {
  return fetchDouyinWeb(
    DOUYIN_POST_PATH,
    {
      sec_user_id: secUid,
      max_cursor: String(maxCursor),
      count: String(PAGE_SIZE),
      locate_query: 'false',
      publish_video_strategy_type: '2',
    },
    credentials,
    diagnostics,
    'walk.page',
  );
}

/**
 * One video's detail, web endpoint first, the mobile endpoint (D-60) as fallback. This is the one
 * detail path the app uses everywhere (Search, the single-detail IPC call, a download's own
 * observation) so a live miss always names which source actually answered.
 */
export async function fetchDouyinDetailPreferWeb(
  awemeId: string,
  credentials: DouyinWebCredentials,
  capturedAt: number,
  diagnostics: SourcesDiagnostics = sourcesDiagnostics(undefined),
): Promise<DouyinOutcome<DouyinDetail>> {
  const viaWeb = await fetchDouyinWebDetail(awemeId, credentials, capturedAt, diagnostics);
  if (viaWeb.ok) {
    diagnostics.event('detail', { id: awemeId, source: 'web' }, { level: 'debug' });
    return viaWeb;
  }
  diagnostics.event(
    'detail.web-failed',
    { id: awemeId, kind: viaWeb.failure.kind },
    { level: 'warn' },
  );
  const viaMobile = await fetchDouyinMobileDetail(awemeId, credentials, capturedAt, diagnostics);
  diagnostics.event(
    'detail',
    { id: awemeId, source: viaMobile.ok ? 'mobile' : 'none' },
    { level: viaMobile.ok ? 'info' : 'error' },
  );
  return viaMobile;
}
