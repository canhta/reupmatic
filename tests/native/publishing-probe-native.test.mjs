import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { probeVideoFile } from '../../dist-node/electron/features/media/probe-file.js';

function fakeWorker(handler) {
  const calls = [];
  return {
    calls,
    request(method, params) {
      calls.push({ method, params });
      return { result: Promise.resolve(handler(method, params)) };
    },
  };
}

test('probing an export never registers it as an asset', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-probe-'));
  const file = path.join(directory, 'export.mp4');
  await writeFile(file, Buffer.from('0123456789'));
  const worker = fakeWorker((method) => {
    if (method === 'media.probe-file')
      return {
        duration_ms: 30_000,
        width: 1080,
        height: 1920,
        has_audio: true,
        frame_rate: '30000/1001',
      };
    throw new Error(`unexpected worker call ${method}`);
  });
  try {
    const facts = await probeVideoFile(worker, file);
    assert.deepEqual(facts, {
      duration_ms: 30_000,
      width: 1080,
      height: 1920,
      size_bytes: 10,
      fps: 30000 / 1001,
    });
    assert.deepEqual(
      worker.calls.map((call) => call.method),
      ['media.probe-file'],
    );
    assert.match(worker.calls[0].params.path, /export\.mp4$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
