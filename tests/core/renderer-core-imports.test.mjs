import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const IMPORT = /import\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// Imports that survive compilation: not `import type`, and not a brace list of only `type` names.
function runtimeImports(file) {
  const found = [];
  for (const [, typeOnly, clause, source] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
    if (typeOnly) continue;
    const names = clause.match(/^\{([\s\S]*)\}$/);
    if (names && names[1].split(',').every((name) => !name.trim() || /^type\s/.test(name.trim())))
      continue;
    found.push(source);
  }
  return found;
}

function resolve(from, source) {
  const base = path.resolve(path.dirname(from), source).replace(/\.js$/, '');
  return [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(existsSync);
}

test('core modules the renderer loads at runtime import nothing from Node', () => {
  const core = path.join(root, 'app/core');
  const problems = [];
  const seen = new Set();
  const queue = [];
  for (const file of files(path.join(root, 'app/ui'))) {
    for (const source of runtimeImports(file)) {
      if (!source.startsWith('.')) continue;
      const target = resolve(file, source);
      if (target?.startsWith(core)) queue.push([target, path.relative(root, file)]);
    }
  }
  while (queue.length) {
    const [file, via] = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const source of runtimeImports(file)) {
      if (source.startsWith('node:')) problems.push(`${path.relative(root, file)} (from ${via})`);
      else if (source.startsWith('.')) {
        const target = resolve(file, source);
        if (target) queue.push([target, via]);
      }
    }
  }
  assert.deepEqual(problems, [], 'renderer-loaded core modules must not import node:*');
});
