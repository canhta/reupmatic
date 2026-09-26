import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClonedVoiceMeta,
  buildSynthesisVoices,
  newClonedVoiceId,
  parseClonedVoiceData,
  parseClonedVoiceId,
  parseClonedVoiceMeta,
  parseCloningEngine,
  parseVoiceCloneRequest,
  parseVoiceLanguage,
  parseVoiceName,
} from '../../dist-core/speech/voices.js';

const request = () => ({
  name: 'My voice',
  engine: 'vieneu-v3-turbo-onnx',
  language: 'vi',
  attested: true,
});

const data = () => ({
  speaker_emb: Array.from({ length: 192 }, () => 0.5),
  ref_codes: [[1, 2, 3, 4]],
});

test('a clone request is refused unless the rights attestation is ticked', () => {
  assert.deepEqual(parseVoiceCloneRequest(request()), request());
  assert.throws(
    () => parseVoiceCloneRequest({ ...request(), attested: false }),
    /SPEECH_CLONE_ATTESTATION_REQUIRED/,
  );
  assert.throws(
    () => parseVoiceCloneRequest({ ...request(), attested: undefined }),
    /SPEECH_CLONE_ATTESTATION_REQUIRED/,
  );
  assert.throws(() => parseVoiceCloneRequest({ ...request(), extra: 1 }), /INVALID_REQUEST/);
  assert.throws(() => parseVoiceCloneRequest(null), /INVALID_REQUEST/);
});

test('only an engine this build can clone with is accepted', () => {
  assert.equal(parseCloningEngine('vieneu-v3-turbo-onnx'), 'vieneu-v3-turbo-onnx');
  // Nano's clone graphs download on first use, which this build refuses to do silently.
  assert.throws(() => parseCloningEngine('vieneu-v3-nano-onnx'), /SPEECH_CLONE_UNSUPPORTED_ENGINE/);
  assert.throws(() => parseCloningEngine('some-tts'), /SPEECH_CLONE_UNSUPPORTED_ENGINE/);
});

test('a voice name is short free text and a language is en or vi', () => {
  assert.equal(parseVoiceName('Giọng của tôi'), 'Giọng của tôi');
  for (const bad of ['', '   ', 'x'.repeat(81), 'bad\u0000name', 7]) {
    assert.throws(() => parseVoiceName(bad), /VOICE_NAME_INVALID|INVALID/);
  }
  assert.equal(parseVoiceLanguage('en'), 'en');
  assert.equal(parseVoiceLanguage('vi'), 'vi');
  assert.throws(() => parseVoiceLanguage('zh'), /INVALID_REQUEST/);
});

test('cloned voice data is the bounded numeric payload the local adapter consumes', () => {
  assert.deepEqual(parseClonedVoiceData(data()), data());
  for (const patch of [
    { speaker_emb: Array.from({ length: 192 }, () => 0) },
    { speaker_emb: Array.from({ length: 191 }, () => 0.5) },
    { speaker_emb: Array.from({ length: 192 }, () => Number.NaN) },
    { speaker_emb: Array.from({ length: 192 }, () => 2000) },
    { ref_codes: [] },
    { ref_codes: [[-1]] },
    { ref_codes: [[70000]] },
    { ref_codes: [[1.5]] },
    { ref_codes: [[1], [1, 2]] },
    { extra: true },
  ]) {
    assert.throws(() => parseClonedVoiceData({ ...data(), ...patch }), /SPEECH_CLONE_INVALID/);
  }
});

test('the cloned voice id is prefixed, stable and accepted only in its declared shape', () => {
  const id = newClonedVoiceId();
  assert.match(id, /^cloned_[a-f0-9]{16}$/);
  assert.equal(parseClonedVoiceId(id), id);
  for (const bad of ['cloned_xyz', 'preset-voice', 'clone_abc', 7, null]) {
    assert.throws(() => parseClonedVoiceId(bad), /INVALID_REQUEST/);
  }
});

test('building metadata stamps the attestation and creation at the same explicit instant', () => {
  const now = new Date('2026-09-26T00:00:00.000Z');
  const meta = buildClonedVoiceMeta(parseVoiceCloneRequest(request()), newClonedVoiceId(), now);
  assert.equal(meta.source, 'cloned');
  assert.equal(meta.attested_at, '2026-09-26T00:00:00.000Z');
  assert.equal(meta.created_at, meta.attested_at);
  assert.deepEqual(parseClonedVoiceMeta(meta), meta);
});

test('the selector union lists presets, this engine clones, and cloud voices with their identity', () => {
  const model = 'a'.repeat(64);
  const clone = buildClonedVoiceMeta(
    parseVoiceCloneRequest({
      name: 'Clone',
      engine: 'vieneu-v3-turbo-onnx',
      language: 'vi',
      attested: true,
    }),
    newClonedVoiceId(),
  );
  const nanoClone = buildClonedVoiceMeta(
    parseVoiceCloneRequest({
      name: 'Nano',
      engine: 'vieneu-v3-turbo-onnx',
      language: 'vi',
      attested: true,
    }),
    newClonedVoiceId(),
  );
  for (const voice of [clone, nanoClone]) voice.engine = 'vieneu-v3-turbo-onnx';
  const options = buildSynthesisVoices(
    {
      engine: 'vieneu-v3-turbo-onnx',
      model_id: model,
      languages: ['en', 'vi'],
      voices: [{ id: 'preset-1', label: 'Preset' }],
    },
    [clone, { ...nanoClone, engine: 'vieneu-v3-nano-onnx' }],
    [{ id: 'clone_remote', label: 'Cloud clone' }],
    'b'.repeat(64),
  );
  assert.deepEqual(
    options.map((option) => [option.id, option.source, option.engine, option.model_id]),
    [
      ['preset-1', 'preset', 'vieneu-v3-turbo-onnx', model],
      [clone.id, 'cloned', 'vieneu-v3-turbo-onnx', model],
      ['clone_remote', 'cloud', 'vieneu-v4', 'b'.repeat(64)],
    ],
  );
});

test('with no local engine and no cloud model the selector is empty, never a placeholder', () => {
  assert.deepEqual(buildSynthesisVoices(null, [], [], null), []);
});

test('stored metadata with a broken timestamp, source or engine is refused loudly', () => {
  const meta = buildClonedVoiceMeta(
    parseVoiceCloneRequest(request()),
    newClonedVoiceId(),
    new Date('2026-09-26T00:00:00.000Z'),
  );
  for (const patch of [
    { source: 'cloud' },
    { attestation: '' },
    { attested_at: 'not-a-date' },
    { created_at: 0 },
    { engine: 'vieneu-v3-nano-onnx' },
    { language: 'zh' },
    { id: 'cloned_nope' },
  ]) {
    assert.throws(() => parseClonedVoiceMeta({ ...meta, ...patch }), /SPEECH_VOICE_STORE_INVALID/);
  }
});
