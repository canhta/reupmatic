import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(filename) : [filename];
  });
}

test('core contracts use capability names rather than generic types filenames', () => {
  const core = path.join(root, 'app', 'core');
  const generic = filesBelow(core)
    .filter((filename) => filename.endsWith('-types.ts'))
    .map((filename) => path.relative(root, filename));
  assert.deepEqual(generic, []);
});

test('storage modules do not export public parsers', () => {
  const core = path.join(root, 'app', 'core');
  const offenders = filesBelow(core)
    .filter((filename) => filename.endsWith('-store.ts'))
    .filter((filename) => /export function parse[A-Z]/.test(readFileSync(filename, 'utf8')))
    .map((filename) => path.relative(root, filename));
  assert.deepEqual(offenders, []);
});
