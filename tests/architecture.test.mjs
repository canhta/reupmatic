import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(path.join(root, name), 'utf8');
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === '__pycache__' ? [] : files(name);
    return /\.(?:ts|tsx|cts|py)$/.test(name) ? [name] : [];
  });
}

test('AGENTS.md is the only root instruction file and owns engineering rules', () => {
  const instructions = readdirSync(root).filter(name => /^(?:agent|agents)\.md$/i.test(name));
  assert.deepEqual(instructions, ['AGENTS.md']);
  for (const rule of ['business capability', '450 lines', 'Comments explain', 'thousand-line', 'Greenfield only', 'no compatibility', 'one current contract']) {
    assert.ok(read('AGENTS.md').includes(rule), rule);
  }
  assert.doesNotMatch(read('AGENTS.md'), /\]\(agent\.md\)/);
  assert.match(read('.agents/skills/reupmatic-engineering/SKILL.md'), /root `AGENTS\.md`/);
});

test('application source stays under the readable-file size limit', () => {
  const oversized = [...files('app'), ...files('worker')].flatMap(name => {
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
  for (const feature of ['editor', 'batch', 'folders', 'vision', 'library', 'settings', 'processing']) {
    assert.ok(files(`app/ui/features/${feature}`).length > 0);
  }
  for (const capability of ['media', 'subtitles', 'vision', 'runtime', 'processing']) {
    assert.ok(files(`worker/${capability}`).length > 0);
  }
});

test('abstractions own behavior instead of adding forwarding layers', () => {
  const rules = read('AGENTS.md');
  for (const phrase of ['Abstraction and deduplication', 'thin wrappers', 'same reason to change']) {
    assert.ok(rules.includes(phrase), phrase);
  }
  const definitions = files('app/ui').filter(name => /(?:async\s+)?function unwrap\b/.test(read(name)));
  assert.deepEqual(definitions, ['app/ui/bridge/client.ts']);
});

test('shared media behavior is imported from its owner, not compatibility re-exports', () => {
  for (const name of ['app/core/batch/batch-output.ts', 'app/core/projects/project.ts']) {
    assert.doesNotMatch(read(name), /export\s*\{[^}]+\}\s*from/);
  }
});
