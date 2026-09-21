import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyDouyinLink,
  isDouyinShortLink,
  recognizeDouyinLink,
  resolveDouyinShortLink,
} from '../../dist-core/library/douyin/link-recognition.js';

// Fixture table of real Douyin link shapes. Video/gallery/user ids below are
// digit strings the same length as live aweme_id/sec_uid values, not real content.
const VIDEO_ID = '7123456789012345678';
const GALLERY_ID = '7234567890123456789';
const SEC_UID = 'MS4wLjABAAAA1a2B3c4D5e6F7g8H9iJkLmNoPqRsTuVwXyZ0';

test('recognizes a video link and declares the item-and-channel Search intent', () => {
  const result = classifyDouyinLink(`https://www.douyin.com/video/${VIDEO_ID}`);
  assert.deepEqual(result, {
    status: 'recognized',
    kind: 'video',
    id: VIDEO_ID,
    canonicalUrl: `https://www.douyin.com/video/${VIDEO_ID}`,
    intent: { returns: 'item-and-channel', secUidFromDetail: true },
    labelKey: 'douyinLinkRecognizedVideo',
  });
});

test('recognizes note/gallery/slides links as the same gallery kind', () => {
  for (const segment of ['note', 'gallery', 'slides']) {
    const result = classifyDouyinLink(`https://www.douyin.com/${segment}/${GALLERY_ID}`);
    assert.equal(result.status, 'recognized');
    assert.equal(result.kind, 'gallery');
    assert.equal(result.id, GALLERY_ID);
    assert.equal(result.labelKey, 'douyinLinkRecognizedGallery');
    assert.deepEqual(result.intent, { returns: 'item-and-channel', secUidFromDetail: true });
  }
});

test('a video link never carries a usable sec_uid — the declaration says so, not a guess', () => {
  const result = classifyDouyinLink(`https://www.douyin.com/video/${VIDEO_ID}`);
  assert.equal(result.intent.secUidFromDetail, true);
  assert.equal('sec_uid' in result, false);
});

test('recognizes a channel link and declares the channel-and-videos Search intent', () => {
  const result = classifyDouyinLink(`https://www.douyin.com/user/${SEC_UID}`);
  assert.deepEqual(result, {
    status: 'recognized',
    kind: 'channel',
    id: SEC_UID,
    canonicalUrl: `https://www.douyin.com/user/${SEC_UID}`,
    intent: { returns: 'channel-and-videos', secUidFromDetail: false },
    labelKey: 'douyinLinkRecognizedChannel',
  });
});

test('bare douyin.com host (no www) is recognized the same way', () => {
  const result = classifyDouyinLink(`https://douyin.com/video/${VIDEO_ID}`);
  assert.equal(result.status, 'recognized');
  assert.equal(result.kind, 'video');
});

test('short links are flagged as needing resolution, not classified blind', () => {
  assert.deepEqual(classifyDouyinLink('https://v.douyin.com/iAbCdEfG/'), {
    status: 'needs-resolution',
    shortUrl: 'https://v.douyin.com/iAbCdEfG/',
  });
  assert.deepEqual(classifyDouyinLink('https://v.iesdouyin.com/iAbCdEfG/'), {
    status: 'needs-resolution',
    shortUrl: 'https://v.iesdouyin.com/iAbCdEfG/',
  });
  assert.equal(isDouyinShortLink('https://v.douyin.com/iAbCdEfG/'), true);
  assert.equal(isDouyinShortLink('https://www.douyin.com/video/1'), false);
});

test('a full Douyin share text is read for its embedded URL, not rejected as garbage', () => {
  const shareText =
    '7.28 02/10 z@k.OZ:/ 用抖音看世界，超级好看的视频，赶紧点击链接观看吧！ ' +
    `https://v.douyin.com/iAbCdEfG/ 复制此链接，打开【抖音】，直接观看视频！`;
  assert.deepEqual(classifyDouyinLink(shareText), {
    status: 'needs-resolution',
    shortUrl: 'https://v.douyin.com/iAbCdEfG/',
  });
});

test('a non-Douyin link is reported unsupported with a reason, not silently parsed', () => {
  assert.deepEqual(classifyDouyinLink('https://www.youtube.com/watch?v=abc123'), {
    status: 'unsupported',
    reasonKey: 'douyinLinkUnsupportedHost',
    input: 'https://www.youtube.com/watch?v=abc123',
  });
});

test('empty input is reported unsupported, never treated as a link', () => {
  for (const input of ['', '   ']) {
    assert.deepEqual(classifyDouyinLink(input), {
      status: 'unsupported',
      reasonKey: 'douyinLinkUnsupportedEmpty',
      input,
    });
  }
});

test('a Douyin host with an unrecognized path is unsupported, not guessed at', () => {
  assert.deepEqual(classifyDouyinLink('https://www.douyin.com/discover'), {
    status: 'unsupported',
    reasonKey: 'douyinLinkUnsupportedPath',
    input: 'https://www.douyin.com/discover',
  });
});

test('a video-shaped path with a non-numeric id is never silently treated as a video id', () => {
  const input = 'https://www.douyin.com/video/not-a-real-id';
  assert.deepEqual(classifyDouyinLink(input), {
    status: 'unsupported',
    reasonKey: 'douyinLinkUnsupportedId',
    input,
  });
});

test('garbage text with no URL at all is unsupported, not thrown', () => {
  assert.deepEqual(classifyDouyinLink('just some random text, no link here'), {
    status: 'unsupported',
    reasonKey: 'douyinLinkUnsupportedHost',
    input: 'just some random text, no link here',
  });
});

test('classification never makes a network call — the fetch global is untouched', async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    called = true;
    throw new Error('classification must not fetch');
  };
  try {
    classifyDouyinLink(`https://www.douyin.com/video/${VIDEO_ID}`);
    classifyDouyinLink('https://v.douyin.com/iAbCdEfG/');
    classifyDouyinLink('https://www.youtube.com/watch?v=abc123');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(called, false);
});

test('resolving a short link follows redirects to the canonical target, using an injected fetch', async () => {
  const canonical = `https://www.douyin.com/video/${VIDEO_ID}`;
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url === 'https://v.douyin.com/iAbCdEfG/') {
      return new Response(null, { status: 302, headers: { location: '/redirect-hop' } });
    }
    if (url === 'https://v.douyin.com/redirect-hop') {
      return new Response(null, { status: 301, headers: { location: canonical } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const result = await resolveDouyinShortLink('https://v.douyin.com/iAbCdEfG/', fakeFetch);
  assert.equal(result.status, 'recognized');
  assert.equal(result.kind, 'video');
  assert.equal(result.canonicalUrl, canonical);
  assert.equal(calls.length, 2);
});

test('a short link that resolves to an unsupported target reports that, not the short link as valid', async () => {
  const fakeFetch = async () =>
    new Response(null, {
      status: 302,
      headers: { location: 'https://www.youtube.com/watch?v=abc' },
    });
  const result = await resolveDouyinShortLink('https://v.douyin.com/iAbCdEfG/', fakeFetch);
  assert.deepEqual(result, {
    status: 'unsupported',
    reasonKey: 'douyinLinkUnsupportedHost',
    input: 'https://www.youtube.com/watch?v=abc',
  });
});

test('a short link that fails to resolve (network error, no location, too many hops) is reported, never guessed', async () => {
  const networkError = async () => {
    throw new Error('offline');
  };
  assert.deepEqual(await resolveDouyinShortLink('https://v.douyin.com/iAbCdEfG/', networkError), {
    status: 'unsupported',
    reasonKey: 'douyinLinkUnsupportedResolution',
    input: 'https://v.douyin.com/iAbCdEfG/',
  });

  const noLocation = async () => new Response(null, { status: 302, headers: {} });
  assert.deepEqual(await resolveDouyinShortLink('https://v.douyin.com/iAbCdEfG/', noLocation), {
    status: 'unsupported',
    reasonKey: 'douyinLinkUnsupportedResolution',
    input: 'https://v.douyin.com/iAbCdEfG/',
  });

  let hops = 0;
  const loop = async (url) => {
    hops += 1;
    return new Response(null, { status: 302, headers: { location: `${url}x` } });
  };
  const looped = await resolveDouyinShortLink('https://v.douyin.com/iAbCdEfG/', loop);
  assert.equal(looped.status, 'unsupported');
  assert.equal(looped.reasonKey, 'douyinLinkUnsupportedResolution');
  assert.ok(hops <= 6, 'redirect chases must be bounded');
});

test('recognizeDouyinLink composes classify and resolve behind one entry point', async () => {
  const canonical = `https://www.douyin.com/user/${SEC_UID}`;
  const fakeFetch = async () =>
    new Response(null, { status: 302, headers: { location: canonical } });

  const direct = await recognizeDouyinLink(`https://www.douyin.com/video/${VIDEO_ID}`, fakeFetch);
  assert.equal(direct.status, 'recognized');
  assert.equal(direct.kind, 'video');

  const viaShortLink = await recognizeDouyinLink('https://v.douyin.com/iAbCdEfG/', fakeFetch);
  assert.equal(viaShortLink.status, 'recognized');
  assert.equal(viaShortLink.kind, 'channel');
  assert.equal(viaShortLink.id, SEC_UID);
});

test('a modal_id link names the video open over any page, the way the address bar shows it', () => {
  const search = classifyDouyinLink(
    'https://www.douyin.com/search/cats?aid=1&modal_id=7000000000000000001&type=general',
  );
  assert.equal(search.status, 'recognized');
  assert.equal(search.kind, 'video');
  assert.equal(search.id, '7000000000000000001');
  assert.equal(search.canonicalUrl, 'https://www.douyin.com/video/7000000000000000001');

  // Over a channel page the open video wins: the user is looking at one item.
  const overChannel = classifyDouyinLink(
    'https://www.douyin.com/user/MS4wLjABAAAAabc?modal_id=7000000000000000001',
  );
  assert.equal(overChannel.kind, 'video');

  // A non-numeric modal_id is not an id; the page's own shape still decides.
  assert.equal(
    classifyDouyinLink('https://www.douyin.com/user/MS4wLjABAAAAabc?modal_id=abc').kind,
    'channel',
  );
});
