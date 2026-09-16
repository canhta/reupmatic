import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSynthesisInput,
  parseSynthesisStatus,
  validateSynthesisResult,
} from '../dist-core/speech/synthesis/contracts.js';
import { assertSynthesisCurrent, prepareSynthesis } from '../dist-core/speech/synthesis/review.js';
import {
  applyLayerCopy,
  editTextLayer,
  previewLayerCopy,
} from '../dist-core/subtitles/layers/commands.js';
import { getTextLayer } from '../dist-core/subtitles/layers/document.js';

const model = 'a'.repeat(64);
const cue = (id, text, start = 0) => ({ id, text, start_ms: start, end_ms: start + 1000 });
function document() {
  return editTextLayer(
    { cues: [cue('caption', 'Unchanged display')] },
    'spoken',
    [cue('one', 'Xin chào'), cue('two', 'Thế giới', 2000)],
    { language: 'vi' },
  );
}
function input(doc = document(), ids) {
  return prepareSynthesis(doc, {
    request_id: 'synthesis-12345678',
    revision: 3,
    language: 'vi',
    voice_id: 'local-voice',
    model_id: model,
    ...(ids ? { cue_ids: ids } : {}),
  });
}
function result(request) {
  const segments = request.params.cues.map((c, i) => ({
    cue_id: c.id,
    start_frame: i * 60000,
    end_frame: i * 60000 + 48000,
  }));
  const frames = segments.at(-1).end_frame;
  return {
    kind: 'synthesis',
    ...request.params,
    artifact_id: '12345678-1234-4234-8234-123456789012',
    sha256: 'b'.repeat(64),
    sample_rate: 48000,
    frames,
    duration_ms: Math.ceil(frames / 48),
    segments,
    runtime: 'controlled-sdk',
    timing: 'natural-sequential',
    gap_ms: 250,
  };
}

test('synthesis captures spoken words only, without changing any document layer', () => {
  const doc = document(),
    before = structuredClone(doc),
    request = input(doc);
  assert.deepEqual(doc, before);
  assert.equal(request.params.source_layer, 'spoken');
  assert.deepEqual(request.params.cues, getTextLayer(doc, 'spoken').cues);
  request.params.cues[0].text = 'Outside mutation';
  assert.equal(getTextLayer(doc, 'spoken').cues[0].text, 'Xin chào');
});

test('selected synthesis uses document order and rejects missing or duplicate IDs', () => {
  const doc = document();
  assert.deepEqual(
    input(doc, ['two', 'one']).params.cues.map((c) => c.id),
    ['one', 'two'],
  );
  assert.equal(input(doc, ['two']).params.cues.length, 1);
  for (const ids of [[], ['unknown'], ['one', 'one']]) {
    assert.throws(() =>
      prepareSynthesis(doc, {
        ...input(doc).params,
        request_id: 'request-12345678',
        revision: 1,
        cue_ids: ids,
      }),
    );
  }
});

test('synthesis refuses empty, stale, mismatched or unknown voice-language input', () => {
  const request = input();
  for (const patch of [
    { source_layer: 'displayed' },
    { language: 'zh' },
    { language: ['vi'] },
    { source_token: 'x' },
    { voice_id: '' },
    { voice_id: 'a\0b' },
    { model_id: 'remote' },
    { cues: [] },
    { cues: [cue('blank', ' ')] },
    { cues: [cue('long', 'x'.repeat(301))] },
    { path: '/tmp/private' },
    { cues: [cue('one', 'ok'), cue('one', 'duplicate')] },
  ]) {
    assert.throws(() =>
      parseSynthesisInput({ ...request, params: { ...request.params, ...patch } }),
    );
  }
  assert.throws(() => input({ cues: [] }), /TEXT_LAYER_EMPTY/);
  assert.throws(
    () => input(editTextLayer(document(), 'spoken', [cue('en', 'Hello')], { language: 'en' })),
    /SYNTHESIS_LANGUAGE_MISMATCH/,
  );
  const source = document();
  let copied = applyLayerCopy(source, previewLayerCopy(source, 'displayed', 'spoken'));
  copied = editTextLayer(copied, 'displayed', [cue('caption', 'Changed source')]);
  assert.throws(() => input(copied), /TEXT_LAYER_STALE/);
});

test('display edits do not stale voice; spoken edits, timing or language changes do', () => {
  const doc = document(),
    request = input(doc);
  assertSynthesisCurrent(
    editTextLayer(doc, 'displayed', [cue('caption', 'Different display')]),
    request,
  );
  for (const changed of [
    editTextLayer(doc, 'spoken', [cue('one', 'New text')]),
    editTextLayer(doc, 'spoken', [cue('one', 'Xin chào', 500), cue('two', 'Thế giới', 2000)]),
    editTextLayer(doc, 'spoken', request.params.cues, { language: 'en' }),
  ]) {
    assert.throws(() => assertSynthesisCurrent(changed, request), /STALE_OPERATION/);
  }
});

test('synthesis result requires complete frame spans, exact correlation and natural timing', () => {
  const request = input(),
    good = result(request);
  assert.deepEqual(validateSynthesisResult(good, request), good);
  for (const patch of [
    { source_token: 'different-token' },
    { voice_id: 'other' },
    { cues: [] },
    { artifact_id: '../source' },
    { sha256: 'x' },
    { sample_rate: 24000 },
    { duration_ms: 1 },
    { timing: 'aligned' },
    { gap_ms: 0 },
    { frames: NaN },
    { runtime: '' },
    { path: '/private' },
    { segments: [] },
    { segments: [...good.segments].reverse() },
    { segments: [{ ...good.segments[0], end_frame: 60001 }, good.segments[1]] },
    { segments: [{ ...good.segments[0], extra: true }, good.segments[1]] },
  ]) {
    assert.throws(
      () => validateSynthesisResult({ ...good, ...patch }, request),
      /INVALID_WORKER_RESPONSE/,
    );
  }
});

test('synthesis readiness never pretends that status is hash/model-quality verification', () => {
  const status = {
    available: true,
    code: null,
    model_id: model,
    languages: ['en', 'vi'],
    voices: [{ id: 'voice', label: 'Giọng có sẵn' }],
    verified: false,
  };
  assert.deepEqual(parseSynthesisStatus(status), status);
  for (const patch of [
    { verified: true },
    { voices: [] },
    { languages: ['zh'] },
    { code: 'FAILED' },
    { model_id: null },
    { voices: [...status.voices, ...status.voices] },
  ]) {
    assert.throws(() => parseSynthesisStatus({ ...status, ...patch }), /INVALID_WORKER_RESPONSE/);
  }
});
