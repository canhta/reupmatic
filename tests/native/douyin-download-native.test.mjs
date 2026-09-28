import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WorkerClient } from '../../dist-core/worker/worker-client.js';
import { pythonExecutable } from '../../scripts/python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function clip(file) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=1',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    file,
  ]);
}

test('media.download streams over HTTP, probes the bytes, and reuses without a second request', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-douyin-download-'));
  const source = path.join(dir, 'source.mp4');
  clip(source);
  const body = await readFile(source);
  const requests = [];
  let served = 0;
  const server = http.createServer((request, response) => {
    requests.push({
      url: request.url,
      cookie: request.headers.cookie,
      referer: request.headers.referer,
    });
    if (request.url === '/video') {
      served += 1;
      response.writeHead(200, {
        'content-length': String(body.length),
        'content-type': 'video/mp4',
      });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end('gone');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const client = new WorkerClient(
    pythonExecutable(root),
    path.join(root, 'worker/main.py'),
    path.join(dir, 'workspace'),
  );
  try {
    const destination = path.join(dir, 'downloaded.mp4');
    const result = await client.request('media.download', {
      url: `${origin}/video`,
      destination,
      cookies: [{ name: 'ttwid', value: 'cookie-value' }],
      referer: 'https://www.douyin.com/',
      expected_size: body.length,
    }).result;

    assert.equal(result.path, destination);
    assert.equal(result.bytes, body.length);
    assert.equal(result.reused, false);
    assert.equal(result.width, 320);
    assert.equal(result.height, 180);
    assert.equal(result.has_audio, false);
    assert.equal(typeof result.sha256, 'string');
    assert.equal(result.sha256.length, 64);
    assert.equal((await stat(destination)).size, body.length);
    // Session rides as request headers only; the result never carries it back.
    assert.equal(requests[0].cookie, 'ttwid=cookie-value');
    assert.equal(requests[0].referer, 'https://www.douyin.com/');
    assert.ok(!JSON.stringify(result).includes('cookie-value'));

    const reused = await client.request('media.download', {
      url: `${origin}/video`,
      destination,
    }).result;
    assert.equal(reused.reused, true);
    assert.equal(reused.sha256, result.sha256);
    assert.equal(served, 1, 'reuse must not touch the network');

    const missing = path.join(dir, 'missing.mp4');
    await assert.rejects(
      client.request('media.download', { url: `${origin}/missing`, destination: missing }).result,
      /DOWNLOAD_FAILED/,
    );
    assert.equal(await stat(`${missing}.part`).catch(() => null), null);
    assert.equal(await stat(missing).catch(() => null), null);
  } finally {
    await client.stop();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
