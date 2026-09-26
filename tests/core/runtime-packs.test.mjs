import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  discardStalePacks,
  installedPackDirectory,
  installRuntimePack,
  packIsInstalled,
  uninstallRuntimePack,
} from '../../dist-core/speech/pack-installer.js';
import {
  currentRuntimePackPlatform,
  findRuntimePack,
  packForEngine,
  parseRuntimePackManifest,
} from '../../dist-core/speech/runtime-packs.js';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function entry(overrides = {}) {
  return {
    name: 'vision',
    version: '2026.09.26',
    platform: 'darwin-arm64',
    url: 'https://example.test/vision.tar.gz',
    sha256: 'a'.repeat(64),
    size: 1024,
    ...overrides,
  };
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function archiveOf(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'pack-src-'));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), body);
  }
  const archive = path.join(root, 'pack.tar.gz');
  const result = spawnSync('tar', ['-czf', archive, '-C', root, ...Object.keys(files)], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return readFile(archive);
}

async function scratch() {
  return mkdtemp(path.join(tmpdir(), 'pack-root-'));
}

test('manifest parsing accepts a well-formed entry and rejects every malformed shape', () => {
  const good = parseRuntimePackManifest({ packs: [entry()] });
  assert.deepEqual(good.packs, [entry()]);
  const bad = [
    { packs: [entry({ name: 'audio' })] },
    { packs: [entry({ platform: 'linux-x64' })] },
    { packs: [entry({ url: 'http://example.test/x.tar.gz' })] },
    { packs: [entry({ sha256: 'nope' })] },
    { packs: [entry({ size: 0 })] },
    { packs: [entry({ extra: 1 })] },
    { packs: [entry(), entry()] },
    { packs: 'nope' },
    { other: [] },
  ];
  for (const value of bad) {
    assert.throws(() => parseRuntimePackManifest(value), /RUNTIME_PACK_MANIFEST_INVALID/);
  }
});

test('platform and engine mapping stay narrow', () => {
  assert.equal(currentRuntimePackPlatform('darwin', 'arm64'), 'darwin-arm64');
  assert.equal(currentRuntimePackPlatform('win32', 'x64'), 'win32-x64');
  assert.equal(currentRuntimePackPlatform('linux', 'x64'), null);
  assert.equal(packForEngine('vieneu-v3-turbo-onnx'), 'synthesis');
  assert.equal(packForEngine('rapidocr-lama'), 'vision');
  assert.equal(packForEngine('faster-whisper'), null);
  const manifest = parseRuntimePackManifest({ packs: [entry()] });
  assert.equal(findRuntimePack(manifest, 'vision', 'darwin-arm64')?.version, '2026.09.26');
  assert.equal(findRuntimePack(manifest, 'vision', 'win32-x64'), null);
  assert.equal(findRuntimePack(manifest, 'synthesis', 'darwin-arm64'), null);
});

test('a successful install extracts atomically into <name>/<version>', async () => {
  const body = await archiveOf({ 'pkg/module.py': 'value = 1\n', 'pkg/data.bin': 'bytes' });
  const server = await startServer((_request, response) => response.end(body));
  const packRoot = await scratch();
  try {
    const phases = [];
    const result = await installRuntimePack({
      entry: entry({
        url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
        sha256: sha256(body),
        size: body.length,
      }),
      packRoot,
      onProgress: (progress) => phases.push(progress.phase),
    });
    assert.equal(result.directory, installedPackDirectory(packRoot, 'vision', '2026.09.26'));
    assert.equal(
      await readFile(path.join(result.directory, 'pkg/module.py'), 'utf8'),
      'value = 1\n',
    );
    assert.deepEqual(phases, ['downloading', 'verifying', 'installing']);
    assert.equal(await packIsInstalled(packRoot, 'vision', '2026.09.26'), true);
    assert.deepEqual(
      (await readdir(packRoot)).filter((name) => name.startsWith('.')),
      [],
    );
  } finally {
    await stop(server);
    await rm(packRoot, { recursive: true, force: true });
  }
});

test('a checksum mismatch leaves no staging, archive or version directory', async () => {
  const body = await archiveOf({ 'module.py': 'value = 1\n' });
  const server = await startServer((_request, response) => response.end(body));
  const packRoot = await scratch();
  try {
    await assert.rejects(
      installRuntimePack({
        entry: entry({
          url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
          sha256: 'b'.repeat(64),
          size: body.length,
        }),
        packRoot,
      }),
      /PACK_HASH_MISMATCH/,
    );
    assert.deepEqual(await readdir(packRoot), []);
  } finally {
    await stop(server);
    await rm(packRoot, { recursive: true, force: true });
  }
});

test('a failed response maps to PACK_DOWNLOAD_FAILED and a refused fetch too', async () => {
  const server = await startServer((_request, response) => {
    response.statusCode = 503;
    response.end();
  });
  const packRoot = await scratch();
  try {
    await assert.rejects(
      installRuntimePack({
        entry: entry({
          url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
          sha256: sha256(Buffer.from('x')),
          size: 1,
        }),
        packRoot,
      }),
      /PACK_DOWNLOAD_FAILED/,
    );
    assert.deepEqual(await readdir(packRoot), []);
  } finally {
    await stop(server);
    const closed = await scratch();
    await assert.rejects(
      installRuntimePack({
        entry: entry({ url: 'http://127.0.0.1:1/pack.tar.gz' }),
        packRoot: closed,
      }),
      /PACK_DOWNLOAD_FAILED/,
    );
    await rm(packRoot, { recursive: true, force: true });
    await rm(closed, { recursive: true, force: true });
  }
});

test('cancellation and extraction failure both roll back fully', async () => {
  const body = await archiveOf({ 'module.py': 'value = 1\n' });
  const server = await startServer((_request, response) => response.end(body));
  const packRoot = await scratch();
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      installRuntimePack({
        entry: entry({
          url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
          sha256: sha256(body),
          size: body.length,
        }),
        packRoot,
        signal: controller.signal,
      }),
      /CANCELLED/,
    );
    assert.deepEqual(await readdir(packRoot), []);

    await assert.rejects(
      installRuntimePack({
        entry: entry({
          url: `http://127.0.0.1:${server.address().port}/pack.tar.gz`,
          sha256: sha256(body),
          size: body.length,
        }),
        packRoot,
        extract: async () => {
          throw new Error('PACK_EXTRACT_FAILED');
        },
      }),
      /PACK_EXTRACT_FAILED/,
    );
    assert.deepEqual(await readdir(packRoot), []);
  } finally {
    await stop(server);
    await rm(packRoot, { recursive: true, force: true });
  }
});

test('a low-disk precondition refuses before any download', async () => {
  const packRoot = await scratch();
  try {
    await assert.rejects(
      installRuntimePack({
        entry: entry({ size: 10 }),
        packRoot,
        freeSpace: async () => 5,
      }),
      /RUNTIME_PACK_DISK_LOW/,
    );
    assert.deepEqual(await readdir(packRoot), []);
  } finally {
    await rm(packRoot, { recursive: true, force: true });
  }
});

test('uninstall removes the version directory and prunes an empty pack', async () => {
  const packRoot = await scratch();
  const directory = installedPackDirectory(packRoot, 'vision', '2026.09.26');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'module.py'), 'x');
  assert.equal(
    await uninstallRuntimePack(packRoot, 'vision', '2026.09.26').then((r) => r.removed),
    true,
  );
  assert.equal(await packIsInstalled(packRoot, 'vision', '2026.09.26'), false);
  await assert.rejects(stat(path.join(packRoot, 'vision')), /ENOENT/);
  assert.equal(
    await uninstallRuntimePack(packRoot, 'vision', '2026.09.26').then((r) => r.removed),
    false,
  );
});

test('discardStalePacks removes staging and partial downloads only', async () => {
  const packRoot = await scratch();
  await mkdir(path.join(packRoot, '.staging-vision-abc'), { recursive: true });
  await writeFile(path.join(packRoot, '.download-vision-abc.tar.gz'), 'x');
  await mkdir(installedPackDirectory(packRoot, 'vision', '2026.09.26'), { recursive: true });
  await discardStalePacks(packRoot);
  assert.deepEqual(await readdir(packRoot), ['vision']);
  await rm(packRoot, { recursive: true, force: true });
});
