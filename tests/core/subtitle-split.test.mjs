import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHINESE_CPS,
  defaultLineLengthSettings,
  LATIN_CPS,
  lineLengthLimits,
  MIN_ON_SCREEN_MS,
  splitCue,
  splitCues,
} from '../../dist-core/subtitles/split.js';
import { defaultSubtitleStyle } from '../../dist-core/subtitles/style.js';

const latinFrame = { width: 1920, height: 1080 };
const cjkFrame = { width: 1080, height: 1920 };
const settings = (patch) => ({ ...defaultLineLengthSettings, ...patch });

test('auto limits come from the style layout and the script reading speed', () => {
  assert.deepEqual(
    lineLengthLimits('Hello world', settings({}), defaultSubtitleStyle, latinFrame),
    {
      maxChars: 138,
      cps: LATIN_CPS,
      maxDuration_ms: 8118,
    },
  );
  assert.deepEqual(lineLengthLimits('你好世界', settings({}), defaultSubtitleStyle, cjkFrame), {
    maxChars: 22,
    cps: CHINESE_CPS,
    maxDuration_ms: 2444,
  });
  const bold = { ...defaultSubtitleStyle, bold: true };
  assert.equal(lineLengthLimits('Hello', settings({}), bold, latinFrame).maxChars, 132);
});

test('custom reading speed, characters and lines override the derived budgets', () => {
  assert.deepEqual(
    lineLengthLimits(
      'Hello',
      settings({ mode: 'custom', cps: 5, max_chars: 10 }),
      defaultSubtitleStyle,
      latinFrame,
    ),
    { maxChars: 10, cps: 5, maxDuration_ms: 2000 },
  );
  assert.equal(
    lineLengthLimits(
      'Hello',
      settings({ cps: 100, max_chars: 1 }),
      defaultSubtitleStyle,
      latinFrame,
    ).maxDuration_ms,
    MIN_ON_SCREEN_MS,
  );
  assert.equal(
    lineLengthLimits('Hello', settings({ max_lines: 1 }), defaultSubtitleStyle, latinFrame)
      .maxChars,
    69,
  );
});

test('splitCues closes a cue at the character budget and keeps every word once', () => {
  const words = [
    { text: 'aa ', start_ms: 0, end_ms: 200 },
    { text: 'bb ', start_ms: 200, end_ms: 400 },
    { text: 'cc', start_ms: 400, end_ms: 600 },
  ];
  const pieces = splitCues(
    words,
    settings({ cps: 1000, max_chars: 4 }),
    defaultSubtitleStyle,
    latinFrame,
  );
  assert.deepEqual(
    pieces.map((entry) => [entry.text, entry.start_ms, entry.end_ms]),
    [
      ['aa bb ', 0, 400],
      ['cc', 400, 600],
    ],
  );
  assert.equal(pieces.map((entry) => entry.text).join(''), 'aa bb cc');
  assert.ok(pieces.every((entry) => entry.words.length > 0));
});

test('splitCues closes a cue at the reading-speed duration', () => {
  const words = [
    { text: 'a', start_ms: 0, end_ms: 600 },
    { text: 'b', start_ms: 600, end_ms: 1100 },
  ];
  const pieces = splitCues(
    words,
    settings({ cps: 100, max_chars: 100 }),
    defaultSubtitleStyle,
    latinFrame,
  );
  assert.deepEqual(
    pieces.map((entry) => entry.text),
    ['a', 'b'],
  );
  assert.ok(pieces.every((entry) => entry.end_ms - entry.start_ms <= 1000));
});

test('splitCue keeps a fitting cue untouched and splits one that does not fit', () => {
  const words = [
    { text: 'Hello ', start_ms: 100, end_ms: 400 },
    { text: 'world', start_ms: 450, end_ms: 900 },
  ];
  const cue = { id: 'a', start_ms: 0, end_ms: 1000, text: 'Hello world', words };
  const [whole] = splitCue(cue, settings({}), defaultSubtitleStyle, latinFrame);
  assert.deepEqual(whole, { text: 'Hello world', start_ms: 0, end_ms: 1000, words });
  const pieces = splitCue(
    {
      ...cue,
      words: [
        { text: 'aaaaa', start_ms: 0, end_ms: 100 },
        { text: ' bbbbb', start_ms: 100, end_ms: 200 },
      ],
      text: 'aaaaa bbbbb',
    },
    settings({ mode: 'custom', cps: 100, max_chars: 5 }),
    defaultSubtitleStyle,
    latinFrame,
  );
  assert.equal(pieces.length, 2);
  assert.deepEqual(
    pieces.map((entry) => entry.text),
    ['aaaaa', ' bbbbb'],
  );
  const noWords = splitCue(
    { id: 'b', start_ms: 10, end_ms: 20, text: 'x' },
    settings({}),
    defaultSubtitleStyle,
    latinFrame,
  );
  assert.deepEqual(noWords, [{ text: 'x', start_ms: 10, end_ms: 20, words: [] }]);
});
