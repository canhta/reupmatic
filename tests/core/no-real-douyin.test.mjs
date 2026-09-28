// Owner rule: no committed test reaches real Douyin, and none reads the owner's
// session or links. A live check may run locally while working and is deleted when done.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { blockDouyinFetch, isDouyinHost } from '../e2e/helpers/douyin-block.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const self = fileURLToPath(import.meta.url);

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'artifacts' || entry.name === '__pycache__') continue;
      yield* files(full);
    } else if (/\.(mjs|js|ts|py)$/.test(entry.name)) yield full;
  }
}

test('no test reads the owner session or links, or opts into a live Douyin run', () => {
  const forbidden =
    /douyin\.cookie\.json|\.env\.douyin|DOUYIN_LIVE|DOUYIN_TEST_(COOKIE|VIDEO_LINK|CHANNEL_LINK)/;
  const offenders = [...files(path.join(root, 'tests'))].filter(
    (file) => file !== self && forbidden.test(readFileSync(file, 'utf8')),
  );
  assert.deepEqual(
    offenders.map((file) => path.relative(root, file)),
    [],
  );
});

test('Douyin and its CDN hosts are recognized; unrelated hosts are not', () => {
  for (const url of [
    'https://www.douyin.com/aweme/v1/web/aweme/post/',
    'https://aweme.snssdk.com/aweme/v1/aweme/detail/',
    'https://v3-dy-o.zjcdn.com/video.mp4',
    'https://v.douyin.com/abc/',
    'https://api.amemv.com/x',
    'https://p3-pc.douyinpic.com/img',
  ]) {
    assert.equal(isDouyinHost(url), true, url);
  }
  for (const url of [
    'http://127.0.0.1:8080/ok',
    'https://example.com/',
    'https://notdouyin.com/',
  ]) {
    assert.equal(isDouyinHost(url), false, url);
  }
});

test('the blocked fetch refuses Douyin before any network and passes everything else through', async () => {
  const reached = [];
  const fetch = blockDouyinFetch(async (input) => {
    reached.push(String(input));
    return new Response('ok');
  });
  await assert.rejects(fetch('https://www.douyin.com/aweme/v1/web/aweme/detail/'), TypeError);
  await assert.rejects(fetch(new URL('https://aweme.snssdk.com/x')), TypeError);
  await assert.rejects(fetch(new Request('https://v3-dy-o.zjcdn.com/v.mp4')), TypeError);
  assert.equal(await (await fetch('http://127.0.0.1:1/ok')).text(), 'ok');
  assert.deepEqual(reached, ['http://127.0.0.1:1/ok']);
});
