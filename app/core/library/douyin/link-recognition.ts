// Ported from the MIT-licensed jiji262/douyin-downloader; reference only, not vendored.
//
// MIT License notice (reproduced per its terms, from the upstream LICENSE file):
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: the above
// copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED
// "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.

export type DouyinLinkKind = 'video' | 'gallery' | 'channel';

export interface DouyinSearchIntent {
  readonly returns: 'item-and-channel' | 'channel-and-videos';
  /** Video/gallery URLs never carry the channel's sec_uid; only the detail response has it. */
  readonly secUidFromDetail: boolean;
}

export interface DouyinLinkRecognized {
  readonly status: 'recognized';
  readonly kind: DouyinLinkKind;
  readonly id: string;
  readonly canonicalUrl: string;
  readonly intent: DouyinSearchIntent;
  readonly labelKey:
    | 'douyinLinkRecognizedVideo'
    | 'douyinLinkRecognizedGallery'
    | 'douyinLinkRecognizedChannel';
}

export type DouyinLinkUnsupportedReason =
  | 'douyinLinkUnsupportedEmpty'
  | 'douyinLinkUnsupportedHost'
  | 'douyinLinkUnsupportedPath'
  | 'douyinLinkUnsupportedId'
  | 'douyinLinkUnsupportedResolution';

export interface DouyinLinkUnsupported {
  readonly status: 'unsupported';
  readonly reasonKey: DouyinLinkUnsupportedReason;
  /** Original pasted text, treated as untrusted display data, never as instructions. */
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

export function isDouyinShortLink(url: string): boolean {
  try {
    return isShortLinkHost(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

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

  if (/\/(?:video|note|gallery|slides)\//.test(path)) {
    return unsupported('douyinLinkUnsupportedId', raw);
  }

  return unsupported('douyinLinkUnsupportedPath', raw);
}

const MAX_SHORT_LINK_REDIRECTS = 5;

// The only network-touching step; classification never calls it.
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
