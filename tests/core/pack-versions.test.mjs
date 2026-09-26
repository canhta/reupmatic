import assert from 'node:assert/strict';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  discardStalePacks,
  installedPackDirectory,
  installRuntimePack,
  packIsInstalled,
} from '../../dist-core/speech/pack-installer.js';
import { archiveOf, entry, scratch, sha256, startServer, stop } from './pack-fixtures.mjs';

test('installing a new version removes the previous one', async () => {
  const body = await archiveOf({ 'module.py': 'value = 1\n' });
  const server = await startServer((_request, response) => response.end(body));
  const packRoot = await scratch();
  const previous = installedPackDirectory(packRoot, 'vision', '2026.01.01');
  await mkdir(previous, { recursive: true });
  await writeFile(path.join(previous, 'module.py'), 'old');
  try {
    await installRuntimePack({
      entry: entry({
        url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
        sha256: sha256(body),
        size: body.length,
      }),
      packRoot,
    });
    assert.equal(await packIsInstalled(packRoot, 'vision', '2026.01.01'), false);
    assert.equal(await packIsInstalled(packRoot, 'vision', '2026.09.26'), true);
    assert.deepEqual(await readdir(packRoot), ['vision']);
    assert.deepEqual(await readdir(path.join(packRoot, 'vision')), ['2026.09.26']);
  } finally {
    await stop(server);
    await rm(packRoot, { recursive: true, force: true });
  }
});

test('discardStalePacks prunes versions the current manifest no longer lists', async () => {
  const packRoot = await scratch();
  for (const [name, version] of [
    ['vision', '2026.01.01'],
    ['vision', '2026.09.26'],
    ['synthesis', '1'],
    ['audio', '9'],
  ]) {
    await mkdir(installedPackDirectory(packRoot, name, version), { recursive: true });
  }
  await discardStalePacks(
    packRoot,
    new Map([
      ['vision', '2026.09.26'],
      ['synthesis', '1'],
    ]),
  );
  assert.deepEqual((await readdir(packRoot)).sort(), ['synthesis', 'vision']);
  assert.deepEqual(await readdir(path.join(packRoot, 'vision')), ['2026.09.26']);
  assert.deepEqual(await readdir(path.join(packRoot, 'synthesis')), ['1']);

  // Without a manifest, installed versions survive a launch-time sweep.
  await mkdir(installedPackDirectory(packRoot, 'vision', '2026.01.01'), { recursive: true });
  await discardStalePacks(packRoot);
  assert.deepEqual((await readdir(path.join(packRoot, 'vision'))).sort(), [
    '2026.01.01',
    '2026.09.26',
  ]);
  await rm(packRoot, { recursive: true, force: true });
});
