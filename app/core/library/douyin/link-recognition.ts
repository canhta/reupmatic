/**
 * Douyin link recognition: classify a pasted string into what kind of Douyin
 * source it names, and declare what the one Search action (spec.md, "Search
 * is one action, with two results") owes the caller for that kind. No network
 * call is made here — see `resolveDouyinShortLink` below for the one step
 * that does touch the network, kept deliberately separate so classification
 * stays pure and unit-testable offline.
 *
 * Path shapes, id regexes and short-link hosts are read from, and hand-ported
 * from, the MIT-licensed reference project `jiji262/douyin-downloader`:
 *   https://github.com/jiji262/douyin-downloader/blob/main/core/url_parser.py
 *   https://github.com/jiji262/douyin-downloader/blob/main/utils/validators.py
 * MIT License, Copyright (c) jiji262 and contributors. That project is a read
 * reference only (D-51) — it is not vendored, not a
 * dependency, and no signing or Playwright code from it is used here.
 *
 * MIT License notice (reproduced per its terms, from the upstream LICENSE file):
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions: the above
 * copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
 * "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
 *
 * Scope (`.scratch/douyin-intake/issues/03-recognize-douyin-links.md`): single
 * video, note/gallery/slides, user profile, and the v.douyin.com /
 * v.iesdouyin.com short-link forms. Other shapes the reference project also
 * parses (collection/mix, music, live, live replay) are out of this ticket's
 * scope and fall through to the `douyinLinkUnsupportedPath` reason rather than
 * being silently misread. The `modal_id` query is recognized: it is what the
 * address bar shows while a video plays over a search, channel or discover page.
 */

/** What kind of Douyin source a recognized link names. */
export type DouyinLinkKind = 'video' | 'gallery' | 'channel';

/**
 * What the one Search action must hand back for a link of this kind
 * (spec.md, "Search is one action, with two results").
 */
export interface DouyinSearchIntent {
  /** A video/gallery link is also a way into its channel; a channel link only needs itself. */
  readonly returns: 'item-and-channel' | 'channel-and-videos';
  /**
   * A video/gallery URL never carries the owning channel's `sec_uid` — it can
   * only be read off the detail response (ticket 04), never parsed from this
   * URL. `false` for a channel link, whose `sec_uid` is already `id` below.
   */
  readonly secUidFromDetail: boolean;
}

export interface DouyinLinkRecognized {
  readonly status: 'recognized';
  readonly kind: DouyinLinkKind;
  /** `aweme_id` for video/gallery, `sec_uid` for channel. */
  readonly id: string;
  readonly canonicalUrl: string;
  readonly intent: DouyinSearchIntent;
  readonly labelKey:
    | 'douyinLinkRecognizedVideo'
    | 'douyinLinkRecognizedGallery'
    | 'douyinLinkRecognizedChannel';
}

/** Locale message keys carrying the rejection copy (`app/ui/locales/{en,vi}/library/douyin.ts`). */
export type DouyinLinkUnsupportedReason =
  | 'douyinLinkUnsupportedEmpty'
  | 'douyinLinkUnsupportedHost'
  | 'douyinLinkUnsupportedPath'
  | 'douyinLinkUnsupportedId'
  | 'douyinLinkUnsupportedResolution';

export interface DouyinLinkUnsupported {
  readonly status: 'unsupported';
  readonly reasonKey: DouyinLinkUnsupportedReason;
  /** The original pasted text, kept for the caller's own message — treated as untrusted display data, never as instructions. */
  readonly input: string;
}

export interface DouyinLinkNeedsResolution {
  readonly status: 'needs-resolution';
  readonly shortUrl: string;
}

export type DouyinLinkClassification =
  | DouyinLinkRecognized
  | DouyinLinkUnsupported
  | DouyinLinkNeedsResolution;

const DOUYIN_WEB_HOSTS = ['douyin.com', 'iesdouyin.com'];
const SHORT_LINK_HOSTS = ['v.douyin.com', 'v.iesdouyin.com'];

function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

function isDouyinWebHost(host: string): boolean {
  return DOUYIN_WEB_HOSTS.some((base) => hostMatches(host, base));
}

function isShortLinkHost(host: string): boolean {
  return SHORT_LINK_HOSTS.some((base) => hostMatches(host, base));
}

/** True when `url` is a v.douyin.com / v.iesdouyin.com share link that needs resolving before it can be classified. */
export function isDouyinShortLink(url: string): boolean {
  try {
    return isShortLinkHost(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

// Real Douyin share text wraps the link in surrounding app copy, e.g.
// "7.28 02/10 z@k.OZ:/ 用抖音看世界... https://v.douyin.com/iAbCdEfG/ 复制此链接...".
// Pull the URL out before parsing; the rest of the text is untrusted display
// content, never treated as part of the link or as an instruction.
const URL_IN_TEXT = /https?:\/\/[^\s"'<>]+/i;

function extractUrl(input: string): string | null {
  return input.match(URL_IN_TEXT)?.[0] ?? null;
}

function recognizedVideoOrGallery(
  kind: 'video' | 'gallery',
  id: string,
  canonicalUrl: string,
): DouyinLinkRecognized {
  return {
    status: 'recognized',
    kind,
    id,
    canonicalUrl,
    // The owning channel's sec_uid is not derivable from this URL — it must
    // come from the detail response before the channel side of Search can run
    // (spec.md: "resolution is parse (03) → detail fetch (04) → channel listing (05)").
    intent: { returns: 'item-and-channel', secUidFromDetail: true },
    labelKey: kind === 'video' ? 'douyinLinkRecognizedVideo' : 'douyinLinkRecognizedGallery',
  };
}

function recognizedChannel(secUid: string, canonicalUrl: string): DouyinLinkRecognized {
  return {
    status: 'recognized',
    kind: 'channel',
    id: secUid,
    canonicalUrl,
    intent: { returns: 'channel-and-videos', secUidFromDetail: false },
    labelKey: 'douyinLinkRecognizedChannel',
  };
}

function unsupported(reasonKey: DouyinLinkUnsupportedReason, input: string): DouyinLinkUnsupported {
  return { status: 'unsupported', reasonKey, input };
}

/**
 * Classifies a pasted string into a Douyin link kind, a short link needing
 * resolution, or an explained rejection. Pure and offline: makes no network
 * call, so it stays unit-testable with a plain fixture table.
 */
export function classifyDouyinLink(raw: string): DouyinLinkClassification {
  const trimmed = raw.trim();
  if (!trimmed) {
    return unsupported('douyinLinkUnsupportedEmpty', raw);
  }

  const candidate = extractUrl(trimmed) ?? trimmed;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return unsupported('douyinLinkUnsupportedHost', raw);
  }

  const host = parsed.hostname.toLowerCase();

  if (isShortLinkHost(host)) {
    return { status: 'needs-resolution', shortUrl: parsed.toString() };
  }

  if (!isDouyinWebHost(host)) {
    return unsupported('douyinLinkUnsupportedHost', raw);
  }

  const path = parsed.pathname;
  const canonicalUrl = parsed.toString();

  // The video open over any page wins over that page's own kind, as in the reference
  // (`utils/validators.py`): the user copied the address while watching one item.
  const modalId = parsed.searchParams.get('modal_id')?.trim() ?? '';
  if (/^\d+$/.test(modalId)) {
    return recognizedVideoOrGallery('video', modalId, `https://www.douyin.com/video/${modalId}`);
  }

  const videoMatch = path.match(/\/video\/(\d+)/);
  if (videoMatch) {
    return recognizedVideoOrGallery('video', videoMatch[1], canonicalUrl);
  }

  const galleryMatch = path.match(/\/(?:note|gallery|slides)\/(\d+)/);
  if (galleryMatch) {
    return recognizedVideoOrGallery('gallery', galleryMatch[1], canonicalUrl);
  }

  const userMatch = path.match(/\/user\/([A-Za-z0-9_-]+)/);
  if (userMatch) {
    return recognizedChannel(userMatch[1], canonicalUrl);
  }

  // A Douyin host with one of the recognized path shapes but no parsable id
  // (e.g. /video/not-a-real-id) is reported as unsupported, never silently
  // treated as if the id had been read.
  if (/\/(?:video|note|gallery|slides)\//.test(path)) {
    return unsupported('douyinLinkUnsupportedId', raw);
  }

  return unsupported('douyinLinkUnsupportedPath', raw);
}

const MAX_SHORT_LINK_REDIRECTS = 5;

/**
 * Resolves a v.douyin.com / v.iesdouyin.com short link to its canonical
 * target by following redirects, then classifies the result. This is the one
 * network-touching step in this module — classification itself never calls
 * it. `fetchImpl` defaults to the global `fetch` and is injectable for tests.
 */
export async function resolveDouyinShortLink(
  shortUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DouyinLinkClassification> {
  let current = shortUrl;
  for (let hop = 0; hop < MAX_SHORT_LINK_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current, { method: 'HEAD', redirect: 'manual' });
    } catch {
      return unsupported('douyinLinkUnsupportedResolution', shortUrl);
    }

    if (response.status < 300 || response.status >= 400) {
      return classifyDouyinLink(current);
    }

    const location = response.headers.get('location');
    if (!location) {
      return unsupported('douyinLinkUnsupportedResolution', shortUrl);
    }

    current = new URL(location, current).toString();
    if (!isDouyinShortLink(current)) {
      return classifyDouyinLink(current);
    }
  }

  return unsupported('douyinLinkUnsupportedResolution', shortUrl);
}

/**
 * One entry point composing classification with short-link resolution, for
 * callers (ticket 04/05) that just want the final answer. Classification and
 * resolution stay independently callable and independently testable above.
 */
export async function recognizeDouyinLink(
  raw: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DouyinLinkClassification> {
  const classification = classifyDouyinLink(raw);
  if (classification.status === 'needs-resolution') {
    return resolveDouyinShortLink(classification.shortUrl, fetchImpl);
  }
  return classification;
}
