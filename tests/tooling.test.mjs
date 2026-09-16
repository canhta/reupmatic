import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { shouldInstallHooks } from '../scripts/install-hooks.mjs';
import { pythonExecutable } from '../scripts/python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('source ZIP and CI do not install Git hooks', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reupmatic-hook-'));
  try {
    assert.equal(shouldInstallHooks(dir, {}), false);
    mkdirSync(path.join(dir, '.git'));
    assert.equal(shouldInstallHooks(dir, { CI: 'true' }), false);
    assert.equal(shouldInstallHooks(dir, { LEFTHOOK: '0' }), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hook setup recognizes only its own Git root, not a parent', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'reupmatic-git-'));
  try {
    const initialized = spawnSync('git', ['init', '--quiet', dir], { encoding: 'utf8' });
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

test('Reupmatic uses one formatter and hook manager with separate typechecking', () => {
  assert.equal(manifest.name, 'reupmatic');
  assert.equal(manifest.productName, 'Reupmatic');
  assert.ok(manifest.devDependencies['@biomejs/biome']);
  assert.ok(manifest.devDependencies.lefthook);
  for (const name of ['husky', 'prettier', 'eslint', 'lint-staged']) {
    assert.equal(manifest.devDependencies[name], undefined);
  }
  assert.match(manifest.scripts.typecheck, /tsc /);
  assert.equal(manifest.scripts['deps:check'], 'npm outdated');
  assert.equal(manifest.scripts['test:syntax'], undefined);
});

test('pre-commit checks do not mutate staging or start media jobs', () => {
  const hooks = readFileSync(path.join(root, 'lefthook.yml'), 'utf8');
  const commands = hooks
    .split('\n')
    .filter((line) => /^\s*(run|stage_fixed):/.test(line))
    .join('\n');
  assert.doesNotMatch(commands, /--write|stage_fixed|git add|ffmpeg|media\.render|pip install/);
  assert.match(commands, /biome check/);
  assert.match(commands, /ruff format --check/);
});

test('format configurations parse and retain recommended checks', () => {
  const config = JSON.parse(readFileSync(path.join(root, 'biome.json'), 'utf8'));
  assert.equal(config.linter.rules.preset, 'recommended');
  assert.equal(config.formatter.indentStyle, 'space');
  assert.equal(config.files.includes.includes('!!research'), true);
  assert.equal(config.assist.actions.source.organizeImports, 'on');
});
