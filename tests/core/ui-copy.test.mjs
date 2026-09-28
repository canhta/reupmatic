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

// Text › the one layer burned into the export is named for what it does, not "Layer".
test('the Text panel names its layer row Burn in', () => {
  const panel = readFileSync(
    path.join(root, 'app/ui/features/editor/subtitle-styles/SubtitleStylesPanel.tsx'),
    'utf8',
  );
  assert.match(panel, /label=\{t\('styleBurnIn'\)\}/);
  assert.doesNotMatch(panel, /t\('textEditingLayer'\)/);
  const expected = { en: 'Burn in', vi: 'Lớp in' };
  for (const locale of ['en', 'vi']) {
    const file = path.join(root, 'app/ui/locales', locale, 'editor/subtitle-styles.ts');
    assert.match(readFileSync(file, 'utf8'), new RegExp(`styleBurnIn: '${expected[locale]}'`));
  }
});

// AGENTS.md: a button is a verb of 1–2 words.
test('catalog and post buttons are one short verb', () => {
  const expected = {
    en: {
      catalogSave: 'Save',
      postClearFilter: 'Clear filter',
      affiliateViewUsage: 'View posts',
      workflowOpenQueue: 'Open queue',
    },
    vi: {
      catalogSave: 'Lưu',
      postClearFilter: 'Bỏ lọc',
      affiliateViewUsage: 'Xem bài',
      workflowOpenQueue: 'Mở hàng đợi',
    },
  };
  for (const locale of ['en', 'vi']) {
    const copy = ['catalog.ts', 'distribution.ts', 'automation.ts']
      .map((file) => readFileSync(path.join(root, 'app/ui/locales', locale, file), 'utf8'))
      .join('\n');
    for (const [key, text] of Object.entries(expected[locale])) {
      assert.match(copy, new RegExp(`\\b${key}: '${text}',`), `${locale} ${key} is '${text}'`);
    }
  }
});

// A voice line longer than its caption: say how many, and what to do, not a vague "overrun".
test('the voice timing warning counts the long lines and names the fix', () => {
  const expected = {
    en: { count: /\{\{count\}\} lines?/, fix: /shorten/i },
    vi: { count: /\{\{count\}\} câu/, fix: /rút gọn/i },
  };
  for (const locale of ['en', 'vi']) {
    const file = path.join(root, 'app/ui/locales', locale, 'speech/synthesis.ts');
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /synthesisTimingConflicts:/, `${locale} keeps the uncounted key`);
    for (const form of ['one', 'other']) {
      const match = text.match(
        new RegExp(`^ {2}synthesisTimingConflicts_${form}:\\s*'([^']*)'`, 'm'),
      );
      assert.ok(match, `${locale} has synthesisTimingConflicts_${form}`);
      assert.match(match[1], expected[locale].count);
      assert.match(match[1], expected[locale].fix);
      assert.doesNotMatch(match[1], /overrun|tràn/i);
    }
  }
  const review = readFileSync(
    path.join(root, 'app/ui/features/speech/synthesis/SynthesisReview.tsx'),
    'utf8',
  );
  // Lines the trim cuts away are not played, so they are never counted as long.
  assert.match(review, /t\('synthesisTimingConflicts', \{ count: longLines\.length \}\)/);
  assert.match(review, /voiceCuesOutsideOutput\(/);
});
