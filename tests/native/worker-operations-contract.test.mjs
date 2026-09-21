import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { operationGroups } from '../../dist-core/worker/operation-groups.js';
import { operations } from '../../dist-core/worker/operations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function schemaMethods() {
  const schema = JSON.parse(
    readFileSync(path.join(root, 'contracts', 'worker-request.schema.json'), 'utf8'),
  );
  const branches = schema.allOf[1].oneOf;
  return new Set(branches.map((branch) => branch.properties.method.const));
}

function pythonInstantMethods() {
  const source = readFileSync(path.join(root, 'worker', 'runtime', 'operations.py'), 'utf8');
  const match = source.match(
    /INSTANT_METHODS:\s*frozenset\[str\]\s*=\s*frozenset\(\s*\{([^}]*)\}/s,
  );
  assert.ok(match, 'could not find INSTANT_METHODS in the generated worker/runtime/operations.py');
  return new Set([...match[1].matchAll(/"([a-z0-9.]+)"/g)].map((m) => m[1]));
}

test('native capability groups compose the worker registry without collisions', () => {
  assert.deepEqual(Object.keys(operationGroups), [
    'runtime',
    'models',
    'assets',
    'media',
    'subtitles',
    'speech',
  ]);
  const groupedNames = Object.values(operationGroups).flatMap((group) => Object.keys(group));
  assert.equal(new Set(groupedNames).size, groupedNames.length, 'worker operation groups overlap');
  assert.deepEqual(groupedNames.sort(), Object.keys(operations).sort());
});

test('the TypeScript operation registry has exactly the schema-generated method set', () => {
  const declared = new Set(Object.keys(operations));
  const schema = schemaMethods();
  assert.deepEqual(
    [...declared].filter((name) => !schema.has(name)).sort(),
    [],
    'operations.ts declares a method contracts/worker-request.schema.json does not',
  );
  assert.deepEqual(
    [...schema].filter((name) => !declared.has(name)).sort(),
    [],
    'contracts/worker-request.schema.json has a method operations.ts does not declare',
  );
});

test("every operation's TypeScript kind matches the Python side's INSTANT_METHODS split", () => {
  const instant = pythonInstantMethods();
  for (const [name, entry] of Object.entries(operations)) {
    const expectedKind = instant.has(name) ? 'instant' : 'queued';
    assert.equal(entry.kind, expectedKind, `${name}: TypeScript says '${entry.kind}'`);
  }
});
