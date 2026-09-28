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
  planVoiceTiming,
  SHIPPED_VOICE_TIMING_POLICY,
} from '../../dist-core/speech/synthesis/timing.js';
import {
  applyVoiceResult,
  defaultVoiceSourceLayer,
  parseVoiceTrack,
  retainedVoiceCueIds,
} from '../../dist-core/speech/synthesis/voice-track.js';
import {
  acceptStaleVoiceTrack,
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
function input(doc = document(), ids, layer = 'spoken') {
  return prepareSynthesis(doc, {
    source_layer: layer,
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
    { source_layer: 'dubbed' },
    { source_layer: ['spoken'] },
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

test('generating the next line keeps the lines already applied to the track', () => {
  const settings = {
    engine: 'vieneu-v3-turbo-onnx',
    mode: 'mix',
    gain_db: 0,
    fade_in_ms: 0,
    fade_out_ms: 0,
  };
  const plan = (request) =>
    planVoiceTiming({
      cues: request.params.cues,
      segments: result(request).segments,
      sample_rate: result(request).sample_rate,
      engine_targets_duration: false,
      speed: 1,
      policy: SHIPPED_VOICE_TIMING_POLICY,
    });
  const doc = document();
  const first = input(doc, ['one']);
  const applied = applyVoiceResult(doc, first, result(first), plan(first), settings);
  // The next selected-cue generate must retain the track's surviving cue, not replace it.
  assert.deepEqual(
    retainedVoiceCueIds(
      applied.voice_track,
      getTextLayer(doc, 'spoken').cues.map((entry) => entry.id),
    ),
    ['one'],
  );
  const second = input(applied, ['one', 'two']);
  const merged = applyVoiceResult(applied, second, result(second), plan(second), settings);
  assert.deepEqual(
    merged.voice_track.plan.lines.map((line) => line.cue_id),
    ['one', 'two'],
  );
  assert.equal(merged.voice_track.provenance.request_id, second.request_id);
});

const voiceSettings = {
  engine: 'vieneu-v3-turbo-onnx',
  mode: 'mix',
  gain_db: 0,
  fade_in_ms: 0,
  fade_out_ms: 0,
};
function voicePlan(request) {
  const done = result(request);
  return planVoiceTiming({
    cues: request.params.cues,
    segments: done.segments,
    sample_rate: done.sample_rate,
    engine_targets_duration: false,
    speed: 1,
    policy: SHIPPED_VOICE_TIMING_POLICY,
  });
}
function translatedDocument() {
  return editTextLayer(document(), 'translated', [cue('t1', 'Bản dịch')], { language: 'vi' });
}

test('voiceover reads the chosen layer and records it on the request and the track', () => {
  const doc = translatedDocument(),
    request = input(doc, undefined, 'translated');
  assert.equal(request.params.source_layer, 'translated');
  assert.equal(request.params.source_token, getTextLayer(doc, 'translated').token);
  assert.deepEqual(request.params.cues, getTextLayer(doc, 'translated').cues);
  const applied = applyVoiceResult(
    doc,
    request,
    result(request),
    voicePlan(request),
    voiceSettings,
  );
  assert.deepEqual(applied.voice_track.origin, {
    kind: 'copy',
    layer: 'translated',
    token: getTextLayer(doc, 'translated').token,
  });
  assert.deepEqual(parseVoiceTrack(applied.voice_track), applied.voice_track);
  assert.throws(
    () =>
      parseVoiceTrack({
        ...applied.voice_track,
        origin: { ...applied.voice_track.origin, layer: 'dubbed' },
      }),
    /INVALID_VOICE_TRACK/,
  );
});

test('voiceover staleness follows its own layer, not the spoken layer', () => {
  const doc = translatedDocument(),
    request = input(doc, undefined, 'translated');
  assertSynthesisCurrent(editTextLayer(doc, 'spoken', [cue('one', 'Khác')]), request);
  assert.throws(
    () => assertSynthesisCurrent(editTextLayer(doc, 'translated', [cue('t1', 'Khác')]), request),
    /STALE_OPERATION/,
  );
  const applied = applyVoiceResult(
    doc,
    request,
    result(request),
    voicePlan(request),
    voiceSettings,
  );
  assert.equal(editTextLayer(applied, 'spoken', [cue('one', 'Khác')]).voice_track.stale, false);
  const edited = editTextLayer(applied, 'translated', [cue('t1', 'Khác')]);
  assert.equal(edited.voice_track.stale, true);
  const kept = acceptStaleVoiceTrack(edited);
  assert.equal(kept.voice_track.stale, false);
  assert.equal(kept.voice_track.origin.layer, 'translated');
  assert.equal(kept.voice_track.origin.token, getTextLayer(edited, 'translated').token);
});

test('the voiceover layer defaults to the track, then a translated layer, then spoken', () => {
  assert.equal(defaultVoiceSourceLayer(document()), 'spoken');
  assert.equal(defaultVoiceSourceLayer({ cues: [] }), 'spoken');
  const doc = translatedDocument();
  assert.equal(defaultVoiceSourceLayer(doc), 'translated');
  const request = input(doc);
  const applied = applyVoiceResult(
    doc,
    request,
    result(request),
    voicePlan(request),
    voiceSettings,
  );
  assert.equal(defaultVoiceSourceLayer(applied), 'spoken');
});
