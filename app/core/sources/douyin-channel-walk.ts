/**
 * The channel walk: paginate a Douyin profile's `aweme/post` over `max_cursor`/`has_more`, the
 * plain-HTTP transport D-62 approves. Core drives the cursor and the
 * stop rules; the injected port is the one thing that differs between a live run (Electron's
 * `web-api.ts`, issuing the actual `fetch`) and a test (a fixture sequence).
 *
 * The stop rules are read from the MIT read-reference `jiji262/douyin-downloader`'s own walk
 * (`core/user_modes/post_strategy.py`, `core/user_modes/base_strategy.py`): Douyin's `has_more`
 * is not trustworthy on its own; a page can claim more while never moving its own cursor, and an
 * empty page can mean the real end, a risk-control hole, or an outright failure — three answers
 * that look alike and must not collapse into one. See `DouyinWalkStopReason`.
 */

import { mapDouyinProfilePage } from './douyin-discovery.js';
import type { DouyinDetail, DouyinFailure, DouyinOutcome } from './douyin-discovery-contracts.js';

/**
 * One page fetch, already classified (`classifyDouyinResponse`) by the caller — core never holds
 * a raw HTTP response or a credential, only the parsed body or a typed failure. Electron's
 * `fetchDouyinWebPostPage` is the one implementation; a test supplies a fixture sequence instead.
 */
export type DouyinPostPagePort = (
  secUid: string,
  maxCursor: number,
) => Promise<DouyinOutcome<Record<string, unknown>>>;

export interface DouyinChannelWalkOptions {
  fetchPage: DouyinPostPagePort;
  /** The hard page cap (`DOUYIN_SEARCH_PAGE_CAP`). A `has_more` stuck true is a real Douyin
   * failure mode, so the loop is bounded by count, never by trust. */
  pageCap: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Delay between successful pages so the walk does not hammer the endpoint (D-62: "~0.5–1 s
   * between pages"). Not applied before the first page or after a retry's own backoff. */
  betweenPagesMs?: number;
  /** One entry per *retry* of a single page's transient failure (rate limiting, a transport
   * error). An empty array disables retrying. Refusals are never retried regardless. */
  backoffMs?: readonly number[];
}

/**
 * Why the walk stopped, named so a diagnostic record (and a test) can tell these apart instead of
 * folding them into one boolean:
 * - `end` — Douyin's own `has_more: 0`. The only reason this is a *complete* channel.
 * - `cap` — the hard page cap was reached while the cursor was still advancing normally.
 * - `stalled` — `has_more` stayed true but the next page's `max_cursor` did not move past the one
 *   just requested. Reference: `post_strategy.py`'s `_page_stop_decision` /
 *   `_cursor_stalled` — treated as "pagination restricted", never as the end.
 * - `failure` — a page could not be read at all: a refusal, `aweme_list: null`, a non-zero
 *   `status_code`, or an empty body (session missing). Reference: `base_strategy.py`'s
 *   `_empty_page_failure_cause`'s three failure causes, none of which is "the end".
 */
export type DouyinWalkStopReason = 'end' | 'cap' | 'stalled' | 'failure';

export interface DouyinChannelWalkResult {
  videos: DouyinDetail[];
  /** Douyin's own `has_more` on the last page read, so a `stalled`/`cap` stop still reports
   * truthfully whether the source claims more exists. */
  mayHaveMore: boolean;
  /** True for `cap` and `stalled`: the walk stopped before `has_more: 0`, so the listing may be
   * incomplete even though nothing classified as an outright failure. */
  truncated: boolean;
  /** Set only on `stopReason: 'failure'`; the items already collected stay usable (a risk-control
   * cut-off mid-listing is a partial result, not a discarded one). */
  failure: DouyinFailure | null;
  stopReason: DouyinWalkStopReason;
  /** Pages successfully read (not attempts — a retried page counts once). */
  pages: number;
}

const DEFAULT_BACKOFF_MS = [1000, 2000] as const;
const DEFAULT_BETWEEN_PAGES_MS = 750;

/**
 * Fetches one page, retrying only a genuinely transient failure (rate limiting, a 5xx, a
 * transport error — `failure.retryable`). A refusal, a malformed body or an expired session is
 * never retried: the rule this whole path borrows from the reference project is that Douyin's
 * edge gate's rejection is deterministic, so retrying it only produces a request storm.
 */
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

/**
 * Walks one channel's `aweme/post` pages, cursor-driven, and folds them into one deduplicated
 * listing. A failure after one or more pages keeps those pages: `videos`/`mayHaveMore` always
 * describe what was actually retrieved, never a discarded attempt.
 */
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
      // `aweme_list: null`, missing entirely, or otherwise unreadable — a risk-control hole or a
      // shape we cannot trust, never a silent "0 more videos".
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
