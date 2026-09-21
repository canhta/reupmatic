import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyVoiceTrack } from '../../dist-core/speech/synthesis/admission.js';
import { SynthesisArtifacts } from '../../dist-core/speech/synthesis/artifacts.js';
import { SynthesisCoordinator } from '../../dist-core/speech/synthesis/coordinator.js';

async function fixture(t, root) {
  root ??= await realpath(await mkdtemp(path.join(tmpdir(), 'synthesis-artifacts-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = {
    request_id: randomUUID(),
    revision: 2,
    params: {
      source_layer: 'spoken',
      source_token: 'spoken-12345678',
      language: 'vi',
      model_id: 'a'.repeat(64),
      voice_id: 'test-voice',
      cues: [{ id: 'one', text: 'Xin chào', start_ms: 1000, end_ms: 2000 }],
    },
  };
  const id = randomUUID(),
    directory = path.join(root, 'speech', id);
  await mkdir(directory, { recursive: true });
  const wav = Buffer.alloc(44 + 4800 * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(9600, 40);
  const result = {
    kind: 'synthesis',
    ...input.params,
    artifact_id: id,
    sha256: createHash('sha256').update(wav).digest('hex'),
    sample_rate: 48000,
    frames: 4800,
    duration_ms: 100,
    segments: [{ cue_id: 'one', start_frame: 0, end_frame: 4800, lead_silence_frames: 0 }],
    runtime: 'controlled-sdk',
  };
  await writeFile(path.join(directory, 'speech.wav'), wav);
  await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(result));
  return { root, directory, input, result, wav, store: new SynthesisArtifacts(root) };
}

test('only admitted confined WAV + receipt pairs become preview/export grants', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.store.verify(f.result.artifact_id), /UNKNOWN_ARTIFACT/);
  assert.deepEqual(await f.store.admit(f.result, f.input), f.result);
  assert.equal(await f.store.verify(f.result.artifact_id), path.join(f.directory, 'speech.wav'));
  await assert.rejects(f.store.admit(f.result, f.input), /DUPLICATE_ARTIFACT/);
  await f.store.save(f.result.artifact_id, 'wav', path.join(f.root, 'saved.wav'), []);
  assert.deepEqual(await readFile(path.join(f.root, 'saved.wav')), f.wav);
  await f.store.save(f.result.artifact_id, 'receipt', path.join(f.root, 'saved.json'), []);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.root, 'saved.json'), 'utf8')), f.result);
});

test('corrupt waveform or changed receipt is not admitted or exported', async (t) => {
  const f = await fixture(t);
  await f.store.admit(f.result, f.input);
  await writeFile(path.join(f.directory, 'speech.wav'), Buffer.alloc(f.wav.length));
  await assert.rejects(f.store.verify(f.result.artifact_id), /SYNTHESIS_ARTIFACT_INVALID/);
  await writeFile(path.join(f.directory, 'speech.wav'), f.wav);
  await writeFile(
    path.join(f.directory, 'receipt.json'),
    JSON.stringify({ ...f.result, voice_id: 'another' }),
  );
  await assert.rejects(f.store.verify(f.result.artifact_id), /SYNTHESIS_ARTIFACT_INVALID/);
});

test('symlink audio cannot grant arbitrary files even when hashes match', async (t) => {
  const f = await fixture(t),
    source = path.join(f.root, 'original.wav');
  await writeFile(source, f.wav);
  await rm(path.join(f.directory, 'speech.wav'));
  await symlink(source, path.join(f.directory, 'speech.wav'));
  await assert.rejects(f.store.admit(f.result, f.input), /SYNTHESIS_ARTIFACT_INVALID/);
  assert.deepEqual(await readFile(source), f.wav);
});

test('export protects imported originals, hardlinks, live drafts and active cancellation', async (t) => {
  const f = await fixture(t);
  await f.store.admit(f.result, f.input);
  const original = path.join(f.root, 'original.wav'),
    alias = path.join(f.root, 'alias.wav');
  await writeFile(original, 'ORIGINAL');
  await link(original, alias);
  for (const destination of [
    original,
    alias,
    path.join(f.directory, 'speech.wav'),
    path.join(f.directory, 'receipt.json'),
  ]) {
    await assert.rejects(
      f.store.save(f.result.artifact_id, 'wav', destination, [original]),
      /SOURCE_OVERWRITE/,
    );
  }
  await assert.rejects(
    f.store.save(f.result.artifact_id, 'wav', path.join(f.root, 'cancelled.wav'), [], () => {
      throw new Error('CANCELLED');
    }),
    /CANCELLED/,
  );
  assert.equal(await readFile(original, 'utf8'), 'ORIGINAL');
});

class Worker extends EventEmitter {
  pending = [];
  cancels = [];
  request(method, params, revision) {
    let resolve, reject;
    const result = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    const id = randomUUID();
    this.pending.push({ id, method, params, revision, resolve, reject });
    return {
      id,
      result,
      cancel: async () => {
        this.cancels.push(id);
        return { requested: true };
      },
    };
  }
}

test('coordinator uses existing worker, checks progress correlation and admits before result', async (t) => {
  const f = await fixture(t),
    worker = new Worker(),
    c = new SynthesisCoordinator(worker, f.store),
    events = [];
  t.after(() => c.close());
  c.on('job', (e) => events.push(e));
  const ticket = c.start(f.input),
    p = worker.pending[0];
  assert.equal(p.method, 'speech.synthesize');
  assert.deepEqual(p.params, f.input.params);
  assert.throws(() => c.start(f.input), /DUPLICATE_REQUEST/);
  for (const patch of [
    { revision: 8 },
    { data: { phase: 'foreign', fraction: 0.1 } },
    { data: { phase: 'running', fraction: NaN } },
  ]) {
    worker.emit('message', {
      v: 1,
      id: p.id,
      revision: 2,
      event: 'progress',
      data: { phase: 'running', fraction: 0.5 },
      ...patch,
    });
  }
  assert.equal(events.length, 0);
  worker.emit('message', {
    v: 1,
    id: p.id,
    revision: 2,
    event: 'progress',
    data: { phase: 'synthesisRunning', fraction: 0.5 },
  });
  assert.equal(events[0].id, f.input.request_id);
  p.resolve(f.result);
  assert.deepEqual(await ticket.result, f.result);
  assert.equal(events.filter((e) => e.event === 'result').length, 1);
  assert.equal(c.activeCount, 0);
});

test('late result after cancel is not published and its verified generated artifact is removed', async (t) => {
  const f = await fixture(t),
    worker = new Worker(),
    c = new SynthesisCoordinator(worker, f.store),
    events = [];
  t.after(() => c.close());
  c.on('job', (e) => events.push(e));
  const ticket = c.start(f.input);
  await ticket.cancel();
  worker.pending[0].resolve(f.result);
  await assert.rejects(ticket.result, /CANCELLED/);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'error');
  await assert.rejects(readFile(path.join(f.directory, 'speech.wav')), /ENOENT/);
  assert.equal(worker.cancels.length, 1);
});

test('invalid child result yields exactly one terminal and releases operation', async (t) => {
  const f = await fixture(t),
    worker = new Worker(),
    c = new SynthesisCoordinator(worker, f.store),
    events = [];
  t.after(() => c.close());
  c.on('job', (e) => events.push(e));
  const ticket = c.start(f.input);
  worker.pending[0].resolve({ ...f.result, frames: 1 });
  await assert.rejects(ticket.result, /INVALID_WORKER_RESPONSE/);
  assert.equal(events.length, 1);
  assert.equal(c.activeCount, 0);
  await c.close();
  assert.throws(() => c.start({ ...f.input, request_id: randomUUID() }), /WORKER_EXITED/);
});

function voiceTrack(result) {
  return {
    artifact: {
      artifact_id: result.artifact_id,
      sha256: result.sha256,
      sample_rate: result.sample_rate,
      frames: result.frames,
      duration_ms: result.duration_ms,
    },
    plan: {
      engine_targets_duration: false,
      lines: [
        { cue_id: 'one', offset_ms: 0, rate: 1, slot_ms: 1000, speech_ms: 100, overrun_ms: 0 },
      ],
      conflicts: [],
    },
    segments: [{ cue_id: 'one', start_frame: 0, end_frame: result.frames, lead_silence_frames: 0 }],
    mode: 'mix',
    gain_db: 0,
    fade_in_ms: 0,
    fade_out_ms: 0,
    muted: false,
    origin: { kind: 'copy', layer: 'spoken', token: 'spoken-12345678' },
    provenance: {
      engine: 'vieneu-v3-turbo-onnx',
      model_id: result.model_id,
      voice_id: result.voice_id,
      runtime: result.runtime,
      request_id: 'request-12345678',
      language: 'vi',
    },
    stale: false,
  };
}

const status = (overrides = {}) => ({
  available: true,
  code: null,
  model_id: 'a'.repeat(64),
  engine: 'vieneu-v3-turbo-onnx',
  languages: ['vi'],
  voices: [{ id: 'test-voice', label: 'Test' }],
  verified: false,
  ...overrides,
});

test('a saved reference is rediscovered and re-verified by a fresh store', async (t) => {
  const f = await fixture(t);
  await f.store.admit(f.result, f.input);
  const reference = { artifact_id: f.result.artifact_id, sha256: f.result.sha256 };
  const reopened = new SynthesisArtifacts(f.root);
  assert.equal(await reopened.verifyReference(reference), path.join(f.directory, 'speech.wav'));
  assert.deepEqual(await reopened.reopen(reference), f.result);
});

test('missing, altered, extra, linked and mismatched voice audio is named, never admitted', async (t) => {
  const absent = await fixture(t);
  const gone = new SynthesisArtifacts(absent.root);
  await assert.rejects(
    gone.reopen({ artifact_id: randomUUID(), sha256: 'e'.repeat(64) }),
    /SYNTHESIS_ARTIFACT_MISSING/,
  );
  await rm(absent.directory, { recursive: true });
  await assert.rejects(
    gone.reopen({ artifact_id: absent.result.artifact_id, sha256: absent.result.sha256 }),
    /SYNTHESIS_ARTIFACT_MISSING/,
  );

  const altered = await fixture(t);
  await writeFile(path.join(altered.directory, 'speech.wav'), Buffer.alloc(altered.wav.length));
  await assert.rejects(
    new SynthesisArtifacts(altered.root).reopen({
      artifact_id: altered.result.artifact_id,
      sha256: altered.result.sha256,
    }),
    /SYNTHESIS_ARTIFACT_ALTERED/,
  );

  const extra = await fixture(t);
  await writeFile(path.join(extra.directory, 'notes.txt'), 'extra');
  await assert.rejects(
    new SynthesisArtifacts(extra.root).reopen({
      artifact_id: extra.result.artifact_id,
      sha256: extra.result.sha256,
    }),
    /SYNTHESIS_ARTIFACT_ALTERED/,
  );

  const linked = await fixture(t);
  await rm(path.join(linked.directory, 'speech.wav'));
  await symlink(path.join(linked.root, 'elsewhere.wav'), path.join(linked.directory, 'speech.wav'));
  await assert.rejects(
    new SynthesisArtifacts(linked.root).reopen({
      artifact_id: linked.result.artifact_id,
      sha256: linked.result.sha256,
    }),
    /SYNTHESIS_ARTIFACT_ALTERED/,
  );

  const mismatch = await fixture(t);
  await assert.rejects(
    new SynthesisArtifacts(mismatch.root).reopen({
      artifact_id: mismatch.result.artifact_id,
      sha256: '0'.repeat(64),
    }),
    /SYNTHESIS_ARTIFACT_ALTERED/,
  );

  const outside = await fixture(t);
  await assert.rejects(
    new SynthesisArtifacts(outside.root).reopen({
      artifact_id: '/etc/passwd',
      sha256: outside.result.sha256,
    }),
    /SYNTHESIS_ARTIFACT_MISSING/,
  );
});

test('generated audio no project references is collectable and substitutions are left alone', async (t) => {
  const f = await fixture(t);
  const g = await fixture(t, f.root);
  const substituted = path.join(f.root, 'speech', randomUUID());
  await mkdir(substituted);
  await writeFile(path.join(substituted, 'foreign.txt'), 'not ours');
  const removed = await f.store.collect([f.result.artifact_id]);
  assert.deepEqual(removed, [g.result.artifact_id]);
  assert.deepEqual(
    await readdir(path.join(f.root, 'speech')).then((names) => names.sort()),
    [f.result.artifact_id, path.basename(substituted)].sort(),
  );
  assert.equal(await readFile(path.join(substituted, 'foreign.txt'), 'utf8'), 'not ours');
});

test('cancelling a voice job leaves no artifact a project could reference', async (t) => {
  const f = await fixture(t),
    worker = new Worker(),
    c = new SynthesisCoordinator(worker, f.store);
  t.after(() => c.close());
  const ticket = c.start(f.input);
  await ticket.cancel();
  worker.pending[0].resolve(f.result);
  await assert.rejects(ticket.result, /CANCELLED/);
  await assert.rejects(
    new SynthesisArtifacts(f.root).reopen({
      artifact_id: f.result.artifact_id,
      sha256: f.result.sha256,
    }),
    /SYNTHESIS_ARTIFACT_MISSING/,
  );
});

test('a voice track is gated by staleness, model availability and the same artifact verification', async (t) => {
  const f = await fixture(t);
  await f.store.admit(f.result, f.input);
  const track = voiceTrack(f.result);
  assert.equal(
    await verifyVoiceTrack(track, f.store, status()),
    path.join(f.directory, 'speech.wav'),
  );
  await assert.rejects(
    verifyVoiceTrack({ ...track, stale: true }, f.store, status()),
    /VOICE_TRACK_STALE/,
  );
  await assert.rejects(
    verifyVoiceTrack(track, f.store, status({ available: false, model_id: null, engine: null })),
    /SYNTHESIS_VOICE_MODEL_MISSING/,
  );
  await assert.rejects(
    verifyVoiceTrack(track, f.store, status({ model_id: 'f'.repeat(64) })),
    /SYNTHESIS_MODEL_CHANGED/,
  );
  await assert.rejects(
    verifyVoiceTrack(track, f.store, status({ voices: [{ id: 'other', label: 'Other' }] })),
    /SYNTHESIS_VOICE_UNAVAILABLE/,
  );
  await assert.rejects(
    verifyVoiceTrack(track, f.store, status({ languages: ['en'] })),
    /MODEL_LANGUAGE_UNAVAILABLE/,
  );
});

test('speech export never replaces selected model files or their hardlink aliases', async (t) => {
  const f = await fixture(t),
    model = path.join(f.root, 'model');
  await mkdir(model);
  const voices = path.join(model, 'voices.json'),
    alias = path.join(f.root, 'preset-alias.json');
  await writeFile(voices, 'MODEL PRESETS');
  await link(voices, alias);
  const config = path.join(f.root, 'local-synthesis.json');
  await writeFile(
    config,
    JSON.stringify({ directory: model, files: { 'voices.json': 'a'.repeat(64) } }),
  );
  await f.store.admit(f.result, f.input);
  for (const destination of [config, voices, alias]) {
    await assert.rejects(
      f.store.save(f.result.artifact_id, 'receipt', destination, []),
      /SOURCE_OVERWRITE/,
    );
  }
  await writeFile(
    config,
    JSON.stringify({ directory: path.join(f.root, 'different-model'), files: {} }),
  );
  await assert.rejects(
    f.store.save(f.result.artifact_id, 'receipt', alias, []),
    /SOURCE_OVERWRITE/,
  );
  assert.equal(await readFile(voices, 'utf8'), 'MODEL PRESETS');
});
