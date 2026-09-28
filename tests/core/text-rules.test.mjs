import assert from 'node:assert/strict';
import test from 'node:test';
import { previewTextRule, shiftCueTimes } from '../../dist-core/subtitles/text-rules.js';

const cues = [
  { id: 'a', start_ms: 500, end_ms: 1500, text: 'Cà phê [1] $1' },
  { id: 'b', start_ms: 2000, end_ms: 3000, text: 'CÀ PHÊ English ☕' },
];
const literal = { mode: 'literal', find: 'cà phê', replacement: '$1', case_sensitive: false };
test('literal rules handle Unicode, case and replacement dollar signs without regex expansion', () => {
  const preview = previewTextRule(cues, literal);
  assert.equal(preview.cues[0].text, '$1 [1] $1');
  assert.equal(preview.cues[1].text, '$1 English ☕');
  assert.equal(preview.matched_cues, 2);
  assert.equal(preview.replacements, 2);
  assert.equal(cues[0].text, 'Cà phê [1] $1');
  assert.equal(previewTextRule(cues, { ...literal, find: '[1]' }).cues[0].text, 'Cà phê $1 $1');
});
test('regex groups and selected scope preview independently before apply', () => {
  const result = previewTextRule(
    cues,
    { mode: 'regex', find: '(Cà) (phê)', replacement: '$2 $1', case_sensitive: true },
    ['a'],
  );
  assert.equal(result.cues[0].text, 'phê Cà [1] $1');
  assert.deepEqual(result.cues[1], cues[1]);
  assert.equal(result.changes[0].before, cues[0].text);
  assert.throws(
    () => previewTextRule(cues, { ...literal, mode: 'regex', find: '(' }),
    /TEXT_RULE_INVALID/,
  );
  assert.throws(() => previewTextRule(cues, literal, []), /TEXT_RULE_SCOPE/);
  assert.throws(() => previewTextRule(cues, literal, ['missing']), /TEXT_RULE_SCOPE/);
});
test('zero-width regex terminates on Unicode input and result sizes are bounded', () => {
  assert.equal(
    previewTextRule([{ ...cues[0], text: '😀' }], {
      ...literal,
      mode: 'regex',
      find: '(?:)',
      replacement: '-',
    }).cues[0].text,
    '-😀-',
  );
  assert.throws(
    () => previewTextRule(cues, { ...literal, find: ' ', replacement: 'x'.repeat(10000) }),
    /TEXT_RULE_LIMIT/,
  );
});
test('bulk timing shifts preserve unselected cues and refuse partial/clamped changes', () => {
  assert.equal(shiftCueTimes(cues, 100, 4000)[0].start_ms, 600);
  assert.equal(shiftCueTimes(cues, -500, 4000, ['a'])[0].start_ms, 0);
  assert.deepEqual(shiftCueTimes(cues, -500, 4000, ['a'])[1], cues[1]);
  assert.throws(() => shiftCueTimes(cues, -501, 4000), /SUBTITLE_SHIFT_RANGE/);
  assert.throws(() => shiftCueTimes(cues, 1500, 4000), /SUBTITLE_SHIFT_RANGE/);
  assert.equal(cues[0].start_ms, 500);
});
