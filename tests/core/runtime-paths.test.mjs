import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { missingBundledPaths, resolveRuntimePaths } from '../../dist-core/worker/runtime-paths.js';

const REPO = path.join(path.sep, 'repo');
const RES = path.join(path.sep, 'app', 'resources');

test('a packaged app resolves the bundled interpreter, worker and media tools', () => {
  const mac = resolveRuntimePaths({
    packaged: true,
    resources: RES,
    repo: REPO,
    platform: 'darwin',
    env: {},
  });
  assert.deepEqual(mac, {
    python: path.join(RES, 'python', 'bin', 'python'),
    worker: path.join(RES, 'worker', 'main.py'),
    ffmpeg: path.join(RES, 'ffmpeg', 'ffmpeg'),
    ffprobe: path.join(RES, 'ffmpeg', 'ffprobe'),
  });

  // Windows keeps the .exe suffixes and the flat python path.
  const win = resolveRuntimePaths({
    packaged: true,
    resources: RES,
    repo: REPO,
    platform: 'win32',
    env: {},
  });
  assert.equal(win.python, path.join(RES, 'python', 'python.exe'));
  assert.equal(win.ffmpeg, path.join(RES, 'ffmpeg', 'ffmpeg.exe'));
  assert.equal(win.ffprobe, path.join(RES, 'ffmpeg', 'ffprobe.exe'));
});

test('a packaged app never falls back to the machine own tools', () => {
  // Even with PYTHON/FFMPEG_PATH set, a packaged run uses what it ships.
  const paths = resolveRuntimePaths({
    packaged: true,
    resources: RES,
    repo: REPO,
    platform: 'darwin',
    env: { PYTHON: '/usr/bin/python3', FFMPEG_PATH: '/opt/ffmpeg' },
  });
  assert.equal(paths.python, path.join(RES, 'python', 'bin', 'python'));
  assert.equal(paths.ffmpeg, path.join(RES, 'ffmpeg', 'ffmpeg'));
});

test('a dev run uses the repo venv, source and PATH tools', () => {
  const withVenv = resolveRuntimePaths({
    packaged: false,
    resources: REPO,
    repo: REPO,
    platform: 'darwin',
    env: {},
    venvExists: true,
  });
  assert.deepEqual(withVenv, {
    python: path.join(REPO, '.venv', 'bin', 'python'),
    worker: path.join(REPO, 'worker', 'main.py'),
    ffmpeg: 'ffmpeg',
    ffprobe: 'ffprobe',
  });

  // No venv: fall back to the platform's interpreter name, or an explicit PYTHON.
  assert.equal(
    resolveRuntimePaths({
      packaged: false,
      resources: REPO,
      repo: REPO,
      platform: 'darwin',
      env: {},
      venvExists: false,
    }).python,
    'python3',
  );
  assert.equal(
    resolveRuntimePaths({
      packaged: false,
      resources: REPO,
      repo: REPO,
      platform: 'win32',
      env: {},
      venvExists: false,
    }).python,
    'python',
  );
  const overridden = resolveRuntimePaths({
    packaged: false,
    resources: REPO,
    repo: REPO,
    platform: 'darwin',
    env: { PYTHON: '/custom/python', FFMPEG_PATH: '/custom/ffmpeg' },
    venvExists: true,
  });
  assert.equal(overridden.python, '/custom/python');
  assert.equal(overridden.ffmpeg, '/custom/ffmpeg');
});

test('a packaged install reports every missing bundled file', () => {
  const paths = resolveRuntimePaths({
    packaged: true,
    resources: RES,
    repo: REPO,
    platform: 'darwin',
    env: {},
  });
  assert.deepEqual(
    missingBundledPaths(paths, () => true),
    [],
  );
  assert.deepEqual(
    missingBundledPaths(paths, (file) => file !== paths.worker),
    [paths.worker],
  );
});
