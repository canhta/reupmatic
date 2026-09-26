import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installRuntimePack } from '../../dist-core/speech/pack-installer.js';
import { archiveOf, entry, scratch, sha256, startServer, stop } from './pack-fixtures.mjs';

test('extraction rejects a symlink that escapes staging and leaves nothing behind', async () => {
  const outside = await mkdtemp(path.join(tmpdir(), 'pack-outside-'));
  const body = await archiveOf(
    { 'pkg/module.py': 'value = 1\n' },
    { 'pkg/escape': path.join(outside, 'secret') },
  );
  const server = await startServer((_request, response) => response.end(body));
  const packRoot = await scratch();
  try {
    await assert.rejects(
      installRuntimePack({
        entry: entry({
          url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
          sha256: sha256(body),
          size: body.length,
        }),
        packRoot,
      }),
      /PACK_EXTRACT_FAILED/,
    );
    assert.deepEqual(await readdir(packRoot), []);
  } finally {
    await stop(server);
    await rm(packRoot, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('extraction accepts a symlink that stays inside staging', async () => {
  const body = await archiveOf({ 'pkg/module.py': 'value = 1\n' }, { 'pkg/alias': 'module.py' });
  const server = await startServer((_request, response) => response.end(body));
  const packRoot = await scratch();
  try {
    const result = await installRuntimePack({
      entry: entry({
        url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
        sha256: sha256(body),
        size: body.length,
      }),
      packRoot,
    });
    assert.equal(await readFile(path.join(result.directory, 'pkg/alias'), 'utf8'), 'value = 1\n');
  } finally {
    await stop(server);
    await rm(packRoot, { recursive: true, force: true });
  }
});
