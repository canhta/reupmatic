import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

export function entry(overrides = {}) {
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

export function startServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

export function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

// A real tar.gz fixture; `links` maps a member path to its symlink target.
export async function archiveOf(files, links = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'pack-src-'));
  for (const [name, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), body);
  }
  for (const [name, target] of Object.entries(links)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await symlink(target, path.join(root, name));
  }
  const archive = path.join(root, 'pack.tar.gz');
  const names = [...Object.keys(files), ...Object.keys(links)];
  const result = spawnSync('tar', ['-czf', archive, '-C', root, ...names], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return readFile(archive);
}

export async function scratch() {
  return mkdtemp(path.join(tmpdir(), 'pack-root-'));
}
