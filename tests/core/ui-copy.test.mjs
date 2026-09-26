import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// AGENTS.md: UI copy never carries a "this build does not…" disclaimer.
test('publishing UI copy never mentions the build', () => {
  for (const locale of ['en', 'vi']) {
    const file = path.join(root, 'app', 'ui', 'locales', locale, 'distribution.ts');
    const text = readFileSync(file, 'utf8');
    assert.ok(!/this build|Bản dựng/i.test(text), `${locale} distribution copy mentions the build`);
  }
});
