import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { shouldInstallHooks } from '../../scripts/install-hooks.mjs';
import { pythonExecutable } from '../../scripts/python.mjs';

test('hook setup recognizes only its own Git root, not a parent', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reupmatic-git-'));
  try {
    // `git init <dir>` obeys an ambient GIT_DIR, which Git sets for every hook it runs.
    // Inheriting it here would initialize the caller's own repository instead of this
    // temporary one, so the run must not see it.
    const env = { ...process.env };
    for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete env[name];
    const initialized = spawnSync('git', ['init', '--quiet', dir], { encoding: 'utf8', env });
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.equal(shouldInstallHooks(dir, {}), true);
    const nested = path.join(dir, 'nested');
    mkdirSync(nested);
    assert.equal(shouldInstallHooks(nested, {}), false);
    assert.equal(existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Python commands prefer explicit executable, then project virtualenv', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reupmatic-python-'));
  try {
    assert.equal(pythonExecutable(dir, { PYTHON: '/chosen/python' }), '/chosen/python');
    assert.equal(pythonExecutable(dir, {}, 'linux'), 'python3');
    assert.equal(pythonExecutable(dir, {}, 'win32'), 'python');
    mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true });
    writeFileSync(path.join(dir, '.venv', 'bin', 'python'), '');
    assert.equal(pythonExecutable(dir, {}, 'linux'), path.join(dir, '.venv', 'bin', 'python'));
    mkdirSync(path.join(dir, '.venv', 'Scripts'), { recursive: true });
    writeFileSync(path.join(dir, '.venv', 'Scripts', 'python.exe'), '');
    assert.equal(
      pythonExecutable(dir, {}, 'win32'),
      path.join(dir, '.venv', 'Scripts', 'python.exe'),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
