import {
  type DouyinLinkClassification,
  type DouyinLinkRecognized,
  type DouyinLinkUnsupportedReason,
  recognizeDouyinLink,
} from '../library/douyin/link-recognition.js';
import {
  type DouyinChannelWalkResult,
  type DouyinPostPagePort,
  walkDouyinChannel,
} from './douyin-channel-walk.js';
import type {
  DouyinChannelRef,
  DouyinDetail,
  DouyinFailure,
  DouyinItem,
  DouyinOutcome,
  DouyinSearchResult,
  DouyinSearchView,
} from './douyin-discovery-contracts.js';

/**
 * The hard ceiling on channel pages one Search will walk. A `has_more` stuck true is a real
 * Douyin failure mode, so the loop is bounded by count rather than by trust (ticket 05). D-62's
 * live evidence walked a 166-video channel to completion over 9 pages (20/page); this stays well
 * above that so an ordinary channel finishes rather than reporting `truncated` at its own size.
 */
export const DOUYIN_SEARCH_PAGE_CAP = 20;

export interface DouyinSearchOptions {
  /** Fetches one video's detail. Electron's implementation tries the web endpoint, then the
   * mobile endpoint as fallback (D-62/D-60); a test injects a fixture directly. */
  fetchDetail(awemeId: string): Promise<DouyinOutcome<DouyinDetail>>;
  /** Fetches one `aweme/post` page for the channel walk. */
  fetchChannelPage: DouyinPostPagePort;
  /** Maximum pages to walk for the channel listing. */
  pageCap?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  betweenPagesMs?: number;
  backoffMs?: readonly number[];
  /** Link recognition, injectable so a test never performs the short-link network hop. */
  recognize?: (raw: string) => Promise<DouyinLinkClassification>;
  /**
   * A detail the host already holds for this id (e.g. from an earlier search or download in the
   * same session), so a repeat lookup reuses it instead of issuing another request. Absence means
   * "not held", never "no item": the request still runs.
   */
  observedDetail?: (awemeId: string) => DouyinDetail | null;
}

/**
 * One Search action's whole outcome. `unsupported` is the link's own rejection (an explained
 * input, not a source failure); `failure` is the source refusing before any exact item existed.
 */
export type DouyinSearchOutcome =
  | { status: 'recognized'; result: DouyinSearchResult }
  | { status: 'unsupported'; reasonKey: DouyinLinkUnsupportedReason }
  | { status: 'failure'; failure: DouyinFailure };

/** The same outcome with the raw payload stripped, as it may cross the renderer boundary. */
export type DouyinSearchViewOutcome =
  | { status: 'recognized'; result: DouyinSearchView }
  | Exclude<DouyinSearchOutcome, { status: 'recognized' }>;

function toItem(item: DouyinDetail): DouyinItem {
  const { raw: _raw, ...rest } = item;
  return rest;
}

/** Drops the untouched payload from a search outcome before it leaves the discovery boundary. */
export function toSearchView(outcome: DouyinSearchOutcome): DouyinSearchViewOutcome {
  if (outcome.status !== 'recognized') return outcome;
  const { result } = outcome;
  return {
    status: 'recognized',
    result: {
      exact: result.exact ? toItem(result.exact) : null,
      channel: result.channel,
      videos: result.videos.map(toItem),
      retrieved: result.retrieved,
      mayHaveMore: result.mayHaveMore,
      truncated: result.truncated,
      partialFailure: result.partialFailure,
    },
  };
}

/**
 * Reads the channel listing from the pages the page's own scroll produced, bounded by `pageCap`.
 *
 * The rules the result encodes:
 * - `retrieved` and `mayHaveMore` say how many candidates actually arrived and whether more may
 *   exist, so an empty or short list is never presented as whole-channel coverage.
 * - A failure after one or more pages keeps those pages and records `partialFailure`; a
 *   risk-control cut-off mid-listing is a partial result, not a discarded one.
 * - Duplicate `aweme_id`s within the walk collapse to one candidate (deduped in the runner).
 */
async function listChannel(
  secUid: string,
  options: DouyinSearchOptions,
): Promise<DouyinChannelWalkResult> {
  const pageCap = options.pageCap ?? DOUYIN_SEARCH_PAGE_CAP;
  return walkDouyinChannel(secUid, {
    fetchPage: options.fetchChannelPage,
    pageCap,
    now: options.now,
    sleep: options.sleep,
    betweenPagesMs: options.betweenPagesMs,
    backoffMs: options.backoffMs,
  });
}

function channelRef(
  secUid: string,
  videos: DouyinDetail[],
  nickname: string | null,
): DouyinChannelRef {
  return { secUid, nickname: nickname ?? videos[0]?.author.nickname ?? null };
}

/** Runs the two-result Search for an already-classified link. */
export async function searchDouyinLink(
  link: DouyinLinkRecognized,
  options: DouyinSearchOptions,
): Promise<DouyinSearchOutcome> {
  let exact: DouyinDetail | null = null;
  let secUid = link.kind === 'channel' ? link.id : '';
  let nickname: string | null = null;

  if (link.kind !== 'channel') {
    // A detail the host already holds is used directly; only a miss issues the request.
    const held = options.observedDetail?.(link.id) ?? null;
    if (held) {
      exact = held;
      secUid = held.author.secUid ?? '';
      nickname = held.author.nickname;
    } else {
      const detail = await options.fetchDetail(link.id);
      if (!detail.ok) return { status: 'failure', failure: detail.failure };
      exact = detail.value;
      secUid = detail.value.author.secUid ?? '';
      nickname = detail.value.author.nickname;
    }
  }

  const listing = secUid
    ? await listChannel(secUid, options)
    : { videos: [], mayHaveMore: false, truncated: false, failure: null };

  return {
    status: 'recognized',
    result: {
      exact,
      // A video whose detail carried no sec_uid yields the exact item and no fabricated channel.
      channel: secUid ? channelRef(secUid, listing.videos, nickname) : null,
      videos: listing.videos,
      retrieved: listing.videos.length,
      mayHaveMore: listing.mayHaveMore,
      truncated: listing.truncated,
      partialFailure: listing.failure,
    },
  };
}

/**
 * The one Search entry point: recognize the pasted text (resolving a short link), then run the
 * item-and-channel search. No download, no spend, no automation — discovery only.
 */
export async function searchDouyinText(
  raw: string,
  options: DouyinSearchOptions,
): Promise<DouyinSearchOutcome> {
  const classification = options.recognize
    ? await options.recognize(raw)
    : await recognizeDouyinLink(raw);
  if (classification.status === 'unsupported') {
    return { status: 'unsupported', reasonKey: classification.reasonKey };
  }
  if (classification.status === 'needs-resolution') {
    // The default recognizer resolves short links; an injected one that did not leaves the hop
    // undone, and pretending an unresolved short link is a usable result would be a lie.
    return { status: 'unsupported', reasonKey: 'douyinLinkUnsupportedResolution' };
  }
  return searchDouyinLink(classification, options);
}
