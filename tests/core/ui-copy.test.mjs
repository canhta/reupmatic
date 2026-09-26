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

// A runaway translation model is not the user's fault: point at the source language, not length.
test('the translation truncation copy does not blame the text length', () => {
  const expected = { en: /source language/i, vi: /ngôn ngữ nguồn/i };
  for (const locale of ['en', 'vi']) {
    const file = path.join(root, 'app', 'ui', 'locales', locale, 'speech', 'translation.ts');
    const match = readFileSync(file, 'utf8').match(/^ {2}translationTruncated:\s*([\s\S]*?),\n/m);
    assert.ok(match, `${locale} has translationTruncated`);
    assert.match(match[1], expected[locale], `${locale} points to the source language`);
    assert.doesNotMatch(match[1], /too long|quá dài/i, `${locale} must not blame the text`);
  }
});
