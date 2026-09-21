import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSynthesisInput,
  parseSynthesisStatus,
  validateSynthesisResult,
} from '../../dist-core/speech/synthesis/contracts.js';
import {
  assertSynthesisCurrent,
  prepareSynthesis,
} from '../../dist-core/speech/synthesis/review.js';
import {
  applyLayerCopy,
  editTextLayer,
  previewLayerCopy,
} from '../../dist-core/subtitles/layers/commands.js';
import { getTextLayer } from '../../dist-core/subtitles/layers/document.js';

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
function result(request, sampleRate = 48000) {
  let next = 0;
  const segments = request.params.cues.map((c, i) => {
    const lead_silence_frames = i === 0 ? 0 : 12000;
    const start_frame = next + lead_silence_frames;
    const end_frame = start_frame + sampleRate;
    next = end_frame;
    return { cue_id: c.id, start_frame, end_frame, lead_silence_frames };
  });
  const frames = next;
  return {
    kind: 'synthesis',
    ...request.params,
    artifact_id: '12345678-1234-4234-8234-123456789012',
    sha256: 'b'.repeat(64),
    sample_rate: sampleRate,
    frames,
    duration_ms: Math.ceil((frames * 1000) / sampleRate),
    segments,
    runtime: 'controlled-sdk',
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

test('synthesis result requires complete frame spans, exact correlation and reported spacing', () => {
  const request = input(),
    good = result(request);
  assert.deepEqual(validateSynthesisResult(good, request), good);
  for (const patch of [
    { source_token: 'different-token' },
    { voice_id: 'other' },
    { cues: [] },
    { artifact_id: '../source' },
    { sha256: 'x' },
    { sample_rate: 0 },
    { sample_rate: 'x' },
    { duration_ms: 1 },
    { frames: NaN },
    { runtime: '' },
    { path: '/private' },
    { segments: [] },
    { segments: [...good.segments].reverse() },
    { segments: [{ ...good.segments[0], end_frame: 48001 }, good.segments[1]] },
    { segments: [{ ...good.segments[0], extra: true }, good.segments[1]] },
    { segments: [{ ...good.segments[0], lead_silence_frames: -1 }, good.segments[1]] },
    { segments: [{ ...good.segments[0], lead_silence_frames: 1 }, good.segments[1]] },
    { segments: [{ ...good.segments[0], start_frame: 1 }, good.segments[1]] },
  ]) {
    assert.throws(
      () => validateSynthesisResult({ ...good, ...patch }, request),
      /INVALID_WORKER_RESPONSE/,
    );
  }
});

test('a well-formed rate this build cannot produce has its own refusal, not a generic one', () => {
  const request = input(),
    good = result(request);
  assert.throws(
    () => validateSynthesisResult({ ...good, sample_rate: 12345 }, request),
    /SYNTHESIS_SAMPLE_RATE_UNSUPPORTED/,
  );
  assert.throws(
    () => validateSynthesisResult({ ...good, sample_rate: 96000 }, request),
    /SYNTHESIS_SAMPLE_RATE_UNSUPPORTED/,
  );
});

test('a result may report another supported rate and is measured at that rate', () => {
  const request = input(),
    alternate = result(request, 24000);
  assert.equal(alternate.duration_ms, 2500);
  assert.deepEqual(validateSynthesisResult(alternate, request), alternate);
  // Duration is derived from the reported rate, never a fixed one.
  assert.throws(
    () => validateSynthesisResult({ ...alternate, duration_ms: 2250 }, request),
    /INVALID_WORKER_RESPONSE/,
  );
});

test('synthesis readiness never pretends that status is hash/model-quality verification', () => {
  const status = {
    available: true,
    code: null,
    model_id: model,
    engine: 'vieneu-v3-turbo-onnx',
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
    { engine: null },
    { engine: 'Not A Slug' },
    { voices: [...status.voices, ...status.voices] },
  ]) {
    assert.throws(() => parseSynthesisStatus({ ...status, ...patch }), /INVALID_WORKER_RESPONSE/);
  }
});
