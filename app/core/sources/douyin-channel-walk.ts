// Stop rules ported from the MIT reference.
import { mapDouyinProfilePage } from './douyin-discovery.js';
import type { DouyinDetail, DouyinFailure, DouyinOutcome } from './douyin-discovery-contracts.js';

// One page fetch, already classified; core never holds a raw response or a credential.
export type DouyinPostPagePort = (
  secUid: string,
  maxCursor: number,
) => Promise<DouyinOutcome<Record<string, unknown>>>;

export interface DouyinChannelWalkOptions {
  fetchPage: DouyinPostPagePort;
  pageCap: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  betweenPagesMs?: number;
  /** One entry per retry; refusals are never retried. */
  backoffMs?: readonly number[];
}

export type DouyinWalkStopReason = 'end' | 'cap' | 'stalled' | 'failure';

export interface DouyinChannelWalkResult {
  videos: DouyinDetail[];
  mayHaveMore: boolean;
  /** True for `cap` and `stalled`. */
  truncated: boolean;
  /** Set only on `failure`; collected items stay usable. */
  failure: DouyinFailure | null;
  stopReason: DouyinWalkStopReason;
  pages: number;
}

const DEFAULT_BACKOFF_MS = [1000, 2000] as const;
const DEFAULT_BETWEEN_PAGES_MS = 750;

// Retries only `failure.retryable`; a refusal would cause a request storm.
async function fetchPageWithRetry(
  fetchPage: DouyinPostPagePort,
  secUid: string,
  cursor: number,
  backoff: readonly number[],
  sleep: (ms: number) => Promise<void>,
): Promise<DouyinOutcome<Record<string, unknown>>> {
  let outcome = await fetchPage(secUid, cursor);
  for (let attempt = 0; attempt < backoff.length; attempt += 1) {
    if (outcome.ok || !outcome.failure.retryable) break;
    await sleep(backoff[attempt] as number);
    outcome = await fetchPage(secUid, cursor);
  }
  return outcome;
}

export async function walkDouyinChannel(
  secUid: string,
  options: DouyinChannelWalkOptions,
): Promise<DouyinChannelWalkResult> {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const betweenPagesMs = options.betweenPagesMs ?? DEFAULT_BETWEEN_PAGES_MS;
  const pageCap = options.pageCap;

  const videos: DouyinDetail[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let mayHaveMore = false;
  let failure: DouyinFailure | null = null;
  let stopReason: DouyinWalkStopReason = 'end';
  let pages = 0;

  for (let page = 1; page <= pageCap; page += 1) {
    if (page > 1) await sleep(betweenPagesMs);
    const requestCursor = cursor;
    const outcome = await fetchPageWithRetry(
      options.fetchPage,
      secUid,
      requestCursor,
      backoff,
      sleep,
    );

    if (!outcome.ok) {
      failure = outcome.failure;
      stopReason = 'failure';
      break;
    }

    const mapped = mapDouyinProfilePage(outcome.value, now());
    if (!mapped.ok) {
      failure = mapped.failure;
      stopReason = 'failure';
      break;
    }

    pages += 1;
    for (const video of mapped.value.videos) {
      if (seen.has(video.awemeId)) continue;
      seen.add(video.awemeId);
      videos.push(video);
    }
    mayHaveMore = mapped.value.hasMore;

    if (!mapped.value.hasMore) {
      stopReason = 'end';
      break;
    }

    const nextCursor = mapped.value.maxCursor;
    if (nextCursor === null || nextCursor === requestCursor) {
      stopReason = 'stalled';
      break;
    }
    if (page >= pageCap) {
      stopReason = 'cap';
      break;
    }
    cursor = nextCursor;
  }

  return {
    videos,
    mayHaveMore,
    truncated: stopReason === 'cap' || stopReason === 'stalled',
    failure,
    stopReason,
    pages,
  };
}
