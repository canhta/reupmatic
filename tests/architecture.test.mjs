import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(path.join(root, name), 'utf8');
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === '__pycache__' ? [] : files(name);
    return /\.(?:ts|tsx|cts|py)$/.test(name) ? [name] : [];
  });
}

test('AGENTS.md is the only root instruction file and fits the agent context budget', () => {
  assert.deepEqual(
    readdirSync(root).filter((name) => /^(?:agent|agents)\.md$/i.test(name)),
    ['AGENTS.md'],
  );
  // Codex reads at most 32 KiB of instruction files by default; past that the tail is
  // silently dropped, so an over-budget file is worse than a short one.
  assert.ok(Buffer.byteLength(read('AGENTS.md')) <= 32 * 1024);
});

test('every document the AGENTS.md role table points at exists', () => {
  const table = read('AGENTS.md').split('| Responsibility | Owner |')[1].split('\n\n')[0];
  const missing = [...table.matchAll(/`([A-Za-z0-9_.\/-]+\.(?:md|json))`/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'AGENTS.md' && !existsSync(path.join(root, name)));
  assert.deepEqual(missing, []);
});

test('application source stays under the readable-file size limit', () => {
  const oversized = [...files('app'), ...files('worker')].flatMap((name) => {
    const lines = read(name).trimEnd().split('\n').length;
    return lines > 450 ? [`${name}: ${lines} lines`] : [];
  });
  assert.deepEqual(oversized, []);
});

test('core owns business logic, not UI or Electron dependencies', () => {
  for (const name of files('app/core')) {
    assert.ok(name.split('/').length >= 4, `${name} needs a business module`);
    const imports = [...read(name).matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)/g)];
    for (const [, specifier] of imports) {
      assert.doesNotMatch(specifier, /^(?:react(?:\/|$)|electron$)/, name);
      assert.doesNotMatch(specifier, /(?:^|\/)ui(?:\/|$)|(?:^|\/)electron(?:\/|$)/, name);
    }
  }
});

test('entry points remain composition-only and features have clear ownership', () => {
  assert.ok(read('app/electron/main.ts').trimEnd().split('\n').length <= 180);
  assert.ok(read('app/ui/main.tsx').trimEnd().split('\n').length <= 35);
  assert.ok(read('worker/main.py').trimEnd().split('\n').length <= 60);
  for (const feature of [
    'editor',
    'batch',
    'folders',
    'vision',
    'library',
    'settings',
    'processing',
  ]) {
    assert.ok(files(`app/ui/features/${feature}`).length > 0);
  }
  for (const capability of ['media', 'subtitles', 'vision', 'runtime', 'processing']) {
    assert.ok(files(`worker/${capability}`).length > 0);
  }
});

test('abstractions own behavior instead of adding forwarding layers', () => {
  const definitions = files('app/ui').filter((name) =>
    /(?:async\s+)?function unwrap\b/.test(read(name)),
  );
  assert.deepEqual(definitions, ['app/ui/bridge/client.ts']);
});

test('shared media behavior is imported from its owner, not compatibility re-exports', () => {
  for (const name of ['app/core/batch/batch-output.ts', 'app/core/projects/project.ts']) {
    assert.doesNotMatch(read(name), /export\s*\{[^}]+\}\s*from/);
  }
});
