import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('real TypeScript -> Python -> FFmpeg bridge and one failed batch item', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bridge-'));
  const media = path.join(dir, 'video tiếng Việt.mp4'),
    sub = path.join(dir, 'track.srt');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    media,
  ]);
  await writeFile(sub, '1\n00:00:00,100 --> 00:00:01,800\nCầu nối thật — real bridge\n');
  const client = new WorkerClient(
    process.env.PYTHON || 'python3',
    path.join(root, 'worker', 'main.py'),
    path.join(dir, 'workspace'),
  );
  const messages = [];
  client.on('message', (m) => messages.push(m));
  try {
    const hello = await client.request('hello', {}).result;
    assert.equal(hello.ffmpeg, true);
    assert.equal(hello.ocr, false);
    const source = await client.request('asset.register', { path: media, kind: 'video' }).result;
    const subtitle = await client.request('asset.register', { path: sub, kind: 'subtitle' }).result;
    const outcome = await client.request(
      'media.render',
      {
        asset_id: source.asset_id,
        subtitle_id: subtitle.asset_id,
        mode: 'sample',
        encoding: 'lossless',
        start_ms: 500,
        end_ms: 1500,
      },
      12,
    ).result;
    assert.equal(outcome.duration_ms, 1000);
    assert.equal(outcome.cache_hit, false);
    await assert.rejects(
      client.request('media.probe', { asset_id: 'missing' }).result,
      /UNKNOWN_ASSET/,
    );
    const repeat = await client.request(
      'media.render',
      {
        asset_id: source.asset_id,
        subtitle_id: subtitle.asset_id,
        mode: 'sample',
        encoding: 'lossless',
        start_ms: 500,
        end_ms: 1500,
      },
      13,
    ).result;
    assert.equal(repeat.cache_hit, true);
    assert.ok(messages.some((m) => m.event === 'progress'));
    assert.ok(messages.some((m) => m.event === 'result' && m.revision === 13));
  } finally {
    await client.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
