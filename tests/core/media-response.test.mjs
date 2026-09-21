import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { registeredMediaResponse, singleByteRange } from '../../dist-core/media/media-response.js';

test('standard ranges: bounded, open-ended, suffix and huge values', () => {
  assert.deepEqual(singleByteRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(singleByteRange('bytes=5-', 10), { start: 5, end: 9 });
  assert.deepEqual(singleByteRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.deepEqual(singleByteRange('bytes=0-99999999999999999999', 10), { start: 0, end: 9 });
  assert.deepEqual(singleByteRange('bytes=-99999999999999999999', 10), { start: 0, end: 9 });
});
test('unsatisfiable, invalid and unsupported ranges are distinct', () => {
  for (const value of ['bytes=10-', 'bytes=-0', 'bytes=5-2'])
    assert.equal(singleByteRange(value, 10), 'unsatisfiable');
  assert.equal(singleByteRange('bytes=0-', 0), 'unsatisfiable');
  for (const value of [null, 'items=0-1', 'bytes=bad', 'bytes=0-1,4-5'])
    assert.equal(singleByteRange(value, 10), null);
});
test('registered file response serves actual ranges, HEAD, misses and cancel safely', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'reupmatic-range-'));
  const filename = path.join(folder, 'đoạn mẫu.mp4');
  await writeFile(filename, '0123456789');
  const request = (headers = {}, method = 'GET') =>
    new Request('https://local/video', { headers, method });
  try {
    const response = await registeredMediaResponse(request({ Range: 'bytes=2-5' }), filename);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), 'bytes 2-5/10');
    assert.equal(response.headers.get('Content-Type'), 'video/mp4');
    assert.equal(await response.text(), '2345');
    const full = await registeredMediaResponse(request(), filename);
    assert.equal(full.status, 200);
    assert.equal(await full.text(), '0123456789');
    const head = await registeredMediaResponse(request({ Range: 'bytes=2-3' }, 'HEAD'), filename);
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('Content-Length'), '10');
    assert.equal(await head.text(), '');
    const invalid = await registeredMediaResponse(request({ Range: 'bytes=100-' }), filename);
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('Content-Range'), 'bytes */10');
    const ifRange = await registeredMediaResponse(
      request({ Range: 'bytes=0-1', 'If-Range': 'old' }),
      filename,
    );
    assert.equal(ifRange.status, 200);
    await ifRange.text();
    assert.equal((await registeredMediaResponse(request(), `${filename}.missing`)).status, 404);
    assert.equal((await registeredMediaResponse(request({}, 'POST'), filename)).status, 405);
    const cancelled = await registeredMediaResponse(request(), filename);
    await cancelled.body.cancel();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
