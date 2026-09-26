import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RenderCoordinator } from '../../dist-core/rendering/render-coordinator.js';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';
import { pythonExecutable } from '../../scripts/python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('real shared coordinator: no-subtitle render, imported SRT, cache and failed-item isolation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-native-'));
  const video = path.join(dir, 'video Việt.mp4');
  const subtitle = path.join(dir, 'track.srt');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=30:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
  await writeFile(subtitle, '1\n00:00:00,100 --> 00:00:01,800\nReupmatic — Tiếng Việt\n');
  const hash = (data) => createHash('sha256').update(data).digest('hex');
  const before = hash(await readFile(video));
  const client = new WorkerClient(
    pythonExecutable(root),
    path.join(root, 'worker/main.py'),
    path.join(dir, 'workspace'),
  );
  const coordinator = new RenderCoordinator(client);
  const events = [];
  coordinator.on('job', (event) => events.push(event));
  try {
    const source = await client.request('asset.register', { path: video, kind: 'video' }).result;
    const subs = await client.request('asset.register', { path: subtitle, kind: 'subtitle' })
      .result;
    const request = () => ({
      request_id: randomUUID(),
      asset_id: source.asset_id,
      revision: 3,
      encoding: 'lossless',
      cues: [],
    });
    const first = await coordinator.start(request()).result;
    assert.equal(first.duration_ms, 2000);
    assert.equal(first.cache_hit, false);
    assert.equal((await coordinator.start(request()).result).cache_hit, true);
    const withText = await coordinator.start(request(), subs.asset_id).result;
    assert.notEqual(first.artifact_id, withText.artifact_id);
    await assert.rejects(coordinator.start({ ...request(), asset_id: 'missing' }).result, {
      code: 'UNKNOWN_ASSET',
    });
    assert.equal((await coordinator.start(request()).result).cache_hit, true);
    assert.equal(coordinator.activeCount, 0);
    assert.equal(events.filter((event) => event.event === 'result').length, 4);
    assert.ok(
      events
        .filter((event) => event.event === 'result')
        .every((event) => event.data.source_asset_id === source.asset_id),
    );
    assert.equal(events.filter((event) => event.event === 'error').length, 1);
    assert.equal(hash(await readFile(video)), before);
  } finally {
    await coordinator.close();
    await client.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('real shared coordinator registers composition clips and preserves captured provenance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-composition-coordinator-'));
  const filename = path.join(dir, 'source.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=160x90:rate=30:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    filename,
  ]);
  const sha256 = createHash('sha256')
    .update(await readFile(filename))
    .digest('hex');
  const client = new WorkerClient(
    pythonExecutable(root),
    path.join(root, 'worker/main.py'),
    path.join(dir, 'workspace'),
  );
  const coordinator = new RenderCoordinator(client),
    events = [];
  coordinator.on('job', (event) => events.push(event));
  try {
    const asset = await client.request('asset.register', { path: filename, kind: 'video' }).result;
    const source = { path: filename, name: 'source.mp4', sha256, duration_ms: 2000 };
    const composition = {
      canvas: { width: 160, height: 90, fps: 30 },
      clips: [
        { id: 'first', source, start_ms: 0, end_ms: 1000, speed: 1, enabled: true },
        { id: 'second', source, start_ms: 1000, end_ms: 2000, speed: 2, enabled: true },
      ],
    };
    const request = {
      request_id: randomUUID(),
      asset_id: asset.asset_id,
      revision: 12,
      encoding: 'review',
      cues: [],
      composition,
    };
    const ticket = coordinator.start(request);
    composition.clips.reverse(); // An in-flight edit must not change this accepted job.
    const result = await ticket.result;
    assert.ok(Math.abs(result.duration_ms - 1500) <= 40);
    const event = events.find((value) => value.event === 'result');
    assert.equal(event.data.source_asset_id, asset.asset_id);
    assert.deepEqual(
      event.data.source_composition.clips.map((clip) => clip.id),
      ['first', 'second'],
    );
    assert.equal(event.revision, 12);
    assert.equal(
      createHash('sha256')
        .update(await readFile(filename))
        .digest('hex'),
      sha256,
    );
    assert.equal(coordinator.activeCount, 0);
  } finally {
    await coordinator.close();
    await client.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
