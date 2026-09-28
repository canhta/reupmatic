import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';
import { pythonExecutable } from '../../scripts/python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Distinct durations, because identical size/rate/duration clips are byte-identical here. */
function clip(file, { duration = 2, size = '160x90' } = {}) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${size}:rate=30:duration=${duration}`,
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    file,
  ]);
}

test('real FFmpeg poster: writes a cover, bounds the long edge, and refuses unsafe outputs', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-poster-'));
  const client = new WorkerClient(
    pythonExecutable(root),
    path.join(root, 'worker/main.py'),
    path.join(dir, 'workspace'),
  );
  try {
    // Wide enough that the 640px long-edge bound actually has to do something.
    const wide = path.join(dir, 'wide.mp4');
    clip(wide, { duration: 3, size: '1280x720' });
    const asset = await client.request('asset.register', { path: wide, kind: 'video' }).result;

    const output = path.join(dir, 'covers', 'item.jpg');
    const result = await client.request('media.poster', {
      asset_id: asset.asset_id,
      output_path: output,
    }).result;

    // The file exists and is non-empty: the whole point of the cover path.
    assert.equal(result.cover_path, output);
    assert.ok((await stat(output)).size > 0, 'poster is empty');
    assert.equal(result.width, 1280);
    assert.equal(result.height, 720);

    // A second item writes its own cover without colliding with the first.
    const short = path.join(dir, 'short.mp4');
    clip(short, { duration: 1 });
    const shortAsset = await client.request('asset.register', { path: short, kind: 'video' })
      .result;
    const shortOutput = path.join(dir, 'covers', 'short.jpg');
    // Under two seconds, so the seek falls back to the midpoint rather than past the end.
    await client.request('media.poster', {
      asset_id: shortAsset.asset_id,
      output_path: shortOutput,
    }).result;
    assert.ok((await stat(shortOutput)).size > 0, 'short-clip poster is empty');

    // Overwriting an existing file is refused rather than silently clobbering a cover.
    await assert.rejects(
      client.request('media.poster', { asset_id: asset.asset_id, output_path: output }).result,
      /OUTPUT_UNSAFE/,
    );

    // A relative path never reaches the filesystem.
    await assert.rejects(
      client.request('media.poster', { asset_id: asset.asset_id, output_path: 'covers/rel.jpg' })
        .result,
      /PATH_NOT_ABSOLUTE/,
    );

    // A file that is not a video fails as one, rather than producing a zero-byte cover.
    const notVideo = path.join(dir, 'notes.mp4');
    await writeFile(notVideo, 'not a video');
    await assert.rejects(
      client.request('asset.register', { path: notVideo, kind: 'video' }).result.then(
        (bad) =>
          client.request('media.poster', {
            asset_id: bad.asset_id,
            output_path: path.join(dir, 'covers', 'bad.jpg'),
          }).result,
      ),
    );
  } finally {
    await client.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
