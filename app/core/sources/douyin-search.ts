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

// Hard page cap; `has_more` is never trusted to terminate.
export const DOUYIN_SEARCH_PAGE_CAP = 20;

export interface DouyinSearchOptions {
  fetchDetail(awemeId: string): Promise<DouyinOutcome<DouyinDetail>>;
  fetchChannelPage: DouyinPostPagePort;
  pageCap?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  betweenPagesMs?: number;
  backoffMs?: readonly number[];
  recognize?: (raw: string) => Promise<DouyinLinkClassification>;
  /** A held detail is reused; absence is never "no item". */
  observedDetail?: (awemeId: string) => DouyinDetail | null;
}

export type DouyinSearchOutcome =
  | { status: 'recognized'; result: DouyinSearchResult }
  | { status: 'unsupported'; reasonKey: DouyinLinkUnsupportedReason }
  | { status: 'failure'; failure: DouyinFailure };

export type DouyinSearchViewOutcome =
  | { status: 'recognized'; result: DouyinSearchView }
  | Exclude<DouyinSearchOutcome, { status: 'recognized' }>;

function toItem(item: DouyinDetail): DouyinItem {
  const { raw: _raw, ...rest } = item;
  return rest;
}

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

// A short list is never whole-channel coverage.
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

export async function searchDouyinLink(
  link: DouyinLinkRecognized,
  options: DouyinSearchOptions,
): Promise<DouyinSearchOutcome> {
  let exact: DouyinDetail | null = null;
  let secUid = link.kind === 'channel' ? link.id : '';
  let nickname: string | null = null;

  if (link.kind !== 'channel') {
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
    return { status: 'unsupported', reasonKey: 'douyinLinkUnsupportedResolution' };
  }
  return searchDouyinLink(classification, options);
}
