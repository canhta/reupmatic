import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WORKER_ERROR_CODES } from '../../dist-core/worker/error-codes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function pythonKnownCodes() {
  const source = readFileSync(path.join(root, 'worker', 'runtime', 'errors.py'), 'utf8');
  const match = source.match(
    /KNOWN_CODES:\s*frozenset\[str\]\s*=\s*frozenset\(\s*\{([^}]*)\}\s*\)/s,
  );
  assert.ok(match, 'could not find KNOWN_CODES in worker/runtime/errors.py');
  return new Set([...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]));
}

test('the TypeScript worker error-code union matches worker/runtime/errors.py KNOWN_CODES', () => {
  const ts = new Set(WORKER_ERROR_CODES);
  const python = pythonKnownCodes();
  assert.deepEqual(
    [...ts].filter((code) => !python.has(code)).sort(),
    [],
    'error-codes.ts has a code worker/runtime/errors.py KNOWN_CODES does not',
  );
  assert.deepEqual(
    [...python].filter((code) => !ts.has(code)).sort(),
    [],
    'worker/runtime/errors.py KNOWN_CODES has a code error-codes.ts does not',
  );
});
