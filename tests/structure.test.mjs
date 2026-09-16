import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkStructure,
  projectRoot,
  readSystemMap,
  scaffold,
} from '../scripts/system-structure.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'reupmatic-structure-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'docs/architecture'), { recursive: true });
  cpSync(
    path.join(projectRoot, 'docs/architecture/system-map.json'),
    path.join(root, 'docs/architecture/system-map.json'),
  );
  return root;
}
function update(root, change) {
  const filename = path.join(root, 'docs/architecture/system-map.json');
  const map = JSON.parse(readFileSync(filename, 'utf8'));
  change(map);
  writeFileSync(filename, JSON.stringify(map));
}

test('the delivered tree retains source paths and 14 scope groups without counting placeholders as code', () => {
  const report = checkStructure();
  assert.equal(report.modules, 22);
  assert.equal(
    report.reserved,
    readSystemMap().modules.flatMap((module) => module.reserved).length,
  );
  const retained = JSON.parse(
    readFileSync(path.join(projectRoot, 'docs/architecture/retained-paths.json'), 'utf8'),
  );
  assert.equal(retained.baseline, '0.14.0');
  assert.equal(retained.paths.length, 888);
  assert.equal(retained.paths.filter((name) => name.endsWith('/.gitkeep')).length, 96);
  assert.ok(
    readSystemMap()
      .modules.filter((module) => module.status === 'planned')
      .every((module) => !module.implemented.length),
  );
});

test('scaffolding is idempotent and never truncates existing markers or real code', (t) => {
  const root = fixture(t);
  const created = scaffold(root);
  assert.equal(
    created.length,
    readSystemMap(root).modules.flatMap((module) => module.reserved).length,
  );
  const marker = path.join(root, created[0]);
  writeFileSync(marker, 'owner note');
  const source = path.join(path.dirname(marker), 'existing.ts');
  writeFileSync(source, 'export const keep = true;');
  assert.deepEqual(scaffold(root), []);
  assert.equal(readFileSync(marker, 'utf8'), 'owner note');
  assert.equal(readFileSync(source, 'utf8'), 'export const keep = true;');
});

test('unsafe paths and duplicate ownership fail before directory creation', (t) => {
  for (const name of ['../outside', '/absolute', 'app/../outside', 'app\\escape']) {
    const root = fixture(t);
    update(root, (map) => map.modules[0].reserved.push(name));
    assert.throws(() => scaffold(root), /Unsafe path/);
    assert.equal(existsSync(path.join(root, 'app')), false);
  }
  const root = fixture(t);
  update(root, (map) => map.modules[1].reserved.push(map.modules[0].reserved[0]));
  assert.throws(() => scaffold(root), /Duplicate ownership/);
});

test('symlink ancestors and dangling marker links cannot redirect writes', (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(path.join(os.tmpdir(), 'reupmatic-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, path.join(root, 'app'), 'dir');
  assert.throws(() => scaffold(root), /Symlink/);
  rmSync(path.join(root, 'app'));
  const name = readSystemMap(root).modules[0].reserved[0];
  mkdirSync(path.join(root, name), { recursive: true });
  symlinkSync(path.join(outside, 'missing'), path.join(root, name, '.gitkeep'));
  assert.throws(() => scaffold(root), /Symlink/);
  assert.equal(existsSync(path.join(outside, 'missing')), false);
});

test('routing is owned by Automation and an empty planned module cannot be relabeled as implemented', (t) => {
  const root = fixture(t);
  update(root, (map) =>
    map.modules
      .find((module) => module.id === 'distribution')
      .reserved.push('app/core/distribution/routing'),
  );
  assert.throws(() => scaffold(root), /Automation owns routing/);
  const other = fixture(t);
  update(
    other,
    (map) => (map.modules.find((module) => module.status === 'planned').status = 'partial'),
  );
  assert.throws(() => scaffold(other), /Empty implementation/);
});
