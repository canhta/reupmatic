import assert from 'node:assert/strict';
import test from 'node:test';
import { retimeCues } from '../../dist-core/editing/edit-recipe.js';
import { prepareTranslation } from '../../dist-core/speech/translation/review.js';
import {
  assertCues,
  mergeNext,
  remapCueWords,
  setCueText,
  setCueTime,
  splitCue,
} from '../../dist-core/subtitles/cues.js';
import {
  applyLayerCopy,
  editTextLayer,
  previewLayerCopy,
} from '../../dist-core/subtitles/layers/commands.js';
import { getTextLayer, parseTextLayers } from '../../dist-core/subtitles/layers/document.js';
import { applyCueStyle, defaultSubtitleStyle } from '../../dist-core/subtitles/style.js';
import { previewTextRule, shiftCueTimes } from '../../dist-core/subtitles/text-rules.js';

const words = [
  { text: 'Hello ', start_ms: 100, end_ms: 400 },
  { text: 'world', start_ms: 450, end_ms: 900 },
];
const cue = { id: 'a', start_ms: 0, end_ms: 1000, text: 'Hello world', words };
const plain = { id: 'b', start_ms: 2000, end_ms: 3000, text: 'Xin chào' };

test('measured word timings must stay inside the cue, ordered, non-overlapping and rejoin the text', () => {
  assert.doesNotThrow(() => assertCues([cue]));
  for (const bad of [
    { ...cue, words: [] },
    { ...cue, words: [{ text: 'Hello world', start_ms: -1, end_ms: 900 }] },
    { ...cue, words: [{ text: 'Hello world', start_ms: 0, end_ms: 1001 }] },
    { ...cue, words: [{ text: 'Hello ', start_ms: 500, end_ms: 400 }] },
    {
      ...cue,
      words: [
        { text: 'Hello ', start_ms: 100, end_ms: 500 },
        { text: 'world', start_ms: 400, end_ms: 900 },
      ],
    },
    { ...cue, words: [{ text: 'Hi world', start_ms: 0, end_ms: 900 }] },
    { ...cue, words: [{ text: 'Hello world', start_ms: 0, end_ms: 900, bold: true }] },
  ]) {
    assert.throws(() => assertCues([bad]), /INVALID_CUES/);
  }
});

test('editing text drops measured words while a style-only edit keeps them', () => {
  const restyled = applyCueStyle([cue], ['a'], defaultSubtitleStyle)[0];
  assert.deepEqual(restyled.words, words);
  assert.equal(restyled.style.bold, false);
  const edited = setCueText(cue, 'Hello there');
  assert.equal(edited.text, 'Hello there');
  assert.equal('words' in edited, false);
  assert.equal(edited.style, undefined);
});

test('retiming scales word timings into the new window, including speed and trim', () => {
  const shifted = setCueTime(cue, 500, 1500);
  assert.equal(shifted.start_ms, 500);
  assert.equal(shifted.end_ms, 1500);
  assert.deepEqual(shifted.words, [
    { text: 'Hello ', start_ms: 600, end_ms: 900 },
    { text: 'world', start_ms: 950, end_ms: 1400 },
  ]);
  const faster = retimeCues([cue], { start_ms: 0, end_ms: 2000, speed: 2, duration_ms: 1000 });
  assert.deepEqual(faster[0].words, [
    { text: 'Hello ', start_ms: 50, end_ms: 200 },
    { text: 'world', start_ms: 225, end_ms: 450 },
  ]);
  const shiftedAll = shiftCueTimes([cue], 250, 4000);
  assert.deepEqual(shiftedAll[0].words, [
    { text: 'Hello ', start_ms: 350, end_ms: 650 },
    { text: 'world', start_ms: 700, end_ms: 1150 },
  ]);
  // A cue starting before the trim window clamps its early words to the new start.
  const trimmed = retimeCues(
    [
      {
        ...cue,
        start_ms: 100,
        end_ms: 1000,
        words: [
          { text: 'Hello ', start_ms: 150, end_ms: 400 },
          { text: 'world', start_ms: 450, end_ms: 900 },
        ],
      },
    ],
    { start_ms: 200, end_ms: 1200, speed: 1, duration_ms: 1000 },
  );
  assert.equal(trimmed[0].start_ms, 0);
  assert.ok(trimmed[0].words.every((word) => word.start_ms >= 0));
  assert.doesNotThrow(() => assertCues(trimmed));
});

test('a word remap never breaks the join when the window collapses', () => {
  const collapsed = remapCueWords(cue, (time) => Math.round(time / 100), 0, 10);
  assert.equal(collapsed.words.map((word) => word.text).join(''), 'Hello world');
  assert.doesNotThrow(() => assertCues([collapsed]));
});

test('split and merge drop measured words on every changed cue', () => {
  const split = splitCue([cue], 'a', 500, 5, 'c');
  assert.equal(split.length, 2);
  assert.ok(split.every((entry) => !('words' in entry)));
  const merged = mergeNext([cue, plain], 'a');
  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, 'Hello world\nXin chào');
  assert.equal('words' in merged[0], false);
});

test('bulk text rules drop words only where the text changed', () => {
  const other = { id: 'b', start_ms: 2000, end_ms: 3000, text: 'Hello' };
  const result = previewTextRule([cue, other], {
    mode: 'literal',
    find: 'world',
    replacement: 'there',
    case_sensitive: true,
  });
  assert.equal(result.cues[0].text, 'Hello there');
  assert.equal('words' in result.cues[0], false);
  assert.deepEqual(result.cues[1].words, undefined);
});

test('copying a layer keeps measured words; translation input is text-only', () => {
  let snapshot = editTextLayer({ cues: [plain] }, 'transcript', [cue], {
    language: 'en',
    origin: {
      kind: 'stt',
      request_id: 'request-123',
      source_sha256: 'a'.repeat(64),
      start_ms: 0,
      end_ms: 1000,
      model_id: 'b'.repeat(64),
    },
  });
  snapshot = applyLayerCopy(snapshot, previewLayerCopy(snapshot, 'transcript', 'displayed'));
  snapshot = applyLayerCopy(snapshot, previewLayerCopy(snapshot, 'transcript', 'spoken'));
  assert.deepEqual(getTextLayer(snapshot, 'displayed').cues[0].words, words);
  assert.deepEqual(getTextLayer(snapshot, 'spoken').cues[0].words, words);
  const input = prepareTranslation(snapshot, {
    request_id: 'request-123',
    revision: 1,
    source_layer: 'transcript',
    source_language: 'en',
    target_language: 'vi',
    model_id: 'b'.repeat(64),
    rules: [],
  });
  assert.equal('words' in input.params.cues[0], false);
});

test('text-layer and project validation accept words but still refuse styles in spoken layers', () => {
  const layers = parseTextLayers({
    transcript: {
      token: 'token-123',
      language: 'en',
      origin: { kind: 'manual' },
      edited: false,
      stale: false,
      visible: false,
      cues: [cue],
    },
    translated: {
      token: 'token-456',
      language: null,
      origin: { kind: 'manual' },
      edited: false,
      stale: false,
      visible: false,
      cues: [],
    },
    spoken: {
      token: 'token-789',
      language: null,
      origin: { kind: 'manual' },
      edited: false,
      stale: false,
      visible: false,
      cues: [],
    },
    displayed: {
      token: 'token-000',
      language: null,
      origin: { kind: 'manual' },
      edited: false,
      stale: false,
      visible: true,
    },
  });
  assert.deepEqual(layers.transcript.cues[0].words, words);
});
