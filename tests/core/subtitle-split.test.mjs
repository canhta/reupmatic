import assert from 'node:assert/strict';
import test from 'node:test';
import { outputFrame } from '../../dist-core/editing/geometry-preview.js';
import { createProject, parseProject } from '../../dist-core/projects/project.js';
import {
  CHINESE_CPS,
  defaultLineLengthSettings,
  LATIN_CPS,
  lineLengthLimits,
  MIN_ON_SCREEN_MS,
  parseLineLengthSettings,
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

test('the output frame is the subtitle canvas after rotate, crop and output scale', () => {
  const source = { width: 1080, height: 1920 };
  assert.deepEqual(outputFrame({}, source), { width: 1080, height: 1920 });
  assert.deepEqual(outputFrame({ rotate: 90 }, source), { width: 1920, height: 1080 });
  assert.deepEqual(outputFrame({ output: { aspect: '1:1', fit: 'cover', height: 1080 } }, source), {
    width: 1080,
    height: 1080,
  });
  assert.deepEqual(
    outputFrame({ crop: { x: 0.25, y: 0, width: 0.5, height: 1 } }, { width: 1920, height: 1080 }),
    { width: 960, height: 1080 },
  );
});

test('a cue sized for the full 9:16 frame splits where the 1:1 output does not', () => {
  const source = { width: 1080, height: 1920 };
  const words = Array.from({ length: 10 }, (_, index) => ({
    text: index === 9 ? 'aaaaa' : 'aaaaa ',
    start_ms: index * 100,
    end_ms: index * 100 + 100,
  }));
  const full = splitCues(words, defaultLineLengthSettings, defaultSubtitleStyle, source);
  const square = splitCues(
    words,
    defaultLineLengthSettings,
    defaultSubtitleStyle,
    outputFrame({ output: { aspect: '1:1', fit: 'cover', height: 1080 } }, source),
  );
  assert.equal(full.length, 2);
  assert.equal(square.length, 1);
  assert.equal(full.map((piece) => piece.text).join(''), square[0].text);
});

test('line-length settings are strict and survive a project round trip', () => {
  assert.deepEqual(parseLineLengthSettings(defaultLineLengthSettings), defaultLineLengthSettings);
  assert.deepEqual(
    parseLineLengthSettings({ mode: 'custom', cps: 12.5, max_lines: 1, max_chars: 30 }),
    { mode: 'custom', cps: 12.5, max_lines: 1, max_chars: 30 },
  );
  for (const bad of [
    { mode: 'auto', cps: null, max_lines: 3, max_chars: null },
    { mode: 'custom', cps: 0, max_lines: 2, max_chars: null },
    { mode: 'custom', cps: null, max_lines: 2, max_chars: 0 },
    { mode: 'custom', cps: null, max_lines: 2, max_chars: 501 },
    { mode: 'custom', cps: 1, max_lines: 2 },
    { mode: 'custom', cps: 1, max_lines: 2, max_chars: null, extra: true },
  ]) {
    assert.throws(() => parseLineLengthSettings(bad), /INVALID_LINE_LENGTH/);
  }
  const line_length = { mode: 'custom', cps: 14, max_lines: 1, max_chars: 28 };
  const project = createProject(
    { path: '/source.mp4', sha256: 'a'.repeat(64) },
    { cues: [], line_length },
  );
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))).line_length, line_length);
  assert.throws(
    () =>
      createProject(
        { path: '/source.mp4', sha256: 'a'.repeat(64) },
        { cues: [], line_length: { ...line_length, max_lines: 4 } },
      ),
    /INVALID_LINE_LENGTH/,
  );
});
