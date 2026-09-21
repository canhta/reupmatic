import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { protectSources } from '../../dist-core/media/files.js';
import {
  createProject,
  loadProject,
  parseProject,
  saveProject,
} from '../../dist-core/projects/project.js';
import {
  applyVoiceResult,
  withoutVoiceTrack,
} from '../../dist-core/speech/synthesis/voice-track.js';
import { assertCues } from '../../dist-core/subtitles/cues.js';
import { editTextLayer } from '../../dist-core/subtitles/layers/commands.js';

const source = { path: '/videos/tự quay.mp4', sha256: 'a'.repeat(64) };
const state = () => ({
  cues: [{ id: 'cue-1', start_ms: 120, end_ms: 1500, text: 'Cà phê Việt Nam\nEnglish ☕' }],
  sample: { start_ms: 0, end_ms: 2000 },
});
const soundtrack = () => ({
  source: {
    path: '/music/bài hát.mp3',
    name: 'bài hát.mp3',
    sha256: 'c'.repeat(64),
    duration_ms: 5000,
  },
  mode: 'mix',
  start_ms: 0,
  end_ms: 5000,
  offset_ms: 0,
  gain_db: -3,
  fade_in_ms: 0,
  fade_out_ms: 0,
  duck: { enabled: false, amount_db: 10, release_ms: 300 },
  muted: false,
});
const voiceTrack = () => ({
  artifact: {
    artifact_id: '11111111-1111-4111-8111-111111111111',
    sha256: 'b'.repeat(64),
    sample_rate: 48000,
    frames: 4800,
    duration_ms: 100,
  },
  plan: {
    engine_targets_duration: false,
    lines: [
      { cue_id: 'cue-1', offset_ms: 120, rate: 1, slot_ms: 1380, speech_ms: 100, overrun_ms: 0 },
    ],
    conflicts: [],
  },
  segments: [{ cue_id: 'cue-1', start_frame: 0, end_frame: 4800, lead_silence_frames: 0 }],
  mode: 'mix',
  gain_db: 0,
  fade_in_ms: 0,
  fade_out_ms: 0,
  muted: false,
  origin: { kind: 'copy', layer: 'spoken', token: 'spoken-12345678' },
  provenance: {
    engine: 'vieneu-v3-turbo-onnx',
    model_id: 'a'.repeat(64),
    voice_id: 'test-voice',
    runtime: 'controlled-sdk',
    request_id: 'request-12345678',
    language: 'vi',
  },
  stale: false,
});

test('project round-trip retains Unicode cues and sample interval without media copies', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-project-'));
  try {
    const file = path.join(dir, 'Bản dựng.reupmatic.json');
    const project = createProject(source, state());
    await saveProject(file, project);
    assert.deepEqual(await loadProject(file), project);
    assert.deepEqual(await readdir(dir), ['Bản dựng.reupmatic.json']);
    assert.ok((await stat(file)).size < 2048);
    assert.equal('uiLocale' in project, false);
    assert.equal('worker' in project, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a project is named, a nameless project is rejected, and the default comes from the source file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-project-name-'));
  try {
    const named = createProject(source, { ...state(), name: 'Bản dựng' });
    assert.equal(named.name, 'Bản dựng');
    const file = path.join(dir, 'named.reupmatic.json');
    await saveProject(file, named);
    assert.deepEqual(await loadProject(file), named);

    // createProject supplies the source file's own basename when the caller
    // names nothing; it never leaves the field off for a reader to invent.
    assert.equal(createProject(source, state()).name, 'tự quay');

    // A saved project without a name is not a valid current project.
    assert.throws(
      () => parseProject({ format: 'reupmatic.project', source, ...state() }),
      /INVALID_PROJECT/,
    );
    assert.throws(() => parseProject({ ...named, name: '   ' }), /INVALID_PROJECT/);
    assert.throws(() => parseProject({ ...named, name: 42 }), /INVALID_PROJECT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('project snapshots are independent from subsequent editor changes', () => {
  const edits = state();
  const project = createProject(source, edits);
  edits.cues[0].text = 'changed';
  edits.sample.end_ms = 5000;
  assert.equal(project.cues[0].text, 'Cà phê Việt Nam\nEnglish ☕');
  assert.equal(project.sample.end_ms, 2000);
});

test('external instructions, URL sources and malformed cue data are rejected', () => {
  const good = createProject(source, state());
  for (const invalid of [
    null,
    [],
    { ...good, token: 'secret' },
    { ...good, source: { ...source, path: 'https://example.org/video.mp4' } },
    { ...good, source: { ...source, sha256: '' } },
    { ...good, cues: [null] },
    { ...good, cues: [{ ...good.cues[0], script: 'publish' }] },
    { ...good, sample: { start_ms: 2000, end_ms: 1000 } },
    { ...good, cues: [good.cues[0], good.cues[0]] },
  ]) {
    assert.throws(() => parseProject(invalid));
  }
});

test('malformed, oversized and invalid UTF-8 input never becomes a partial project', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-corrupt-'));
  try {
    const file = path.join(dir, 'bad.reupmatic.json');
    for (const data of [
      '{"format":',
      Buffer.from([0xff, 0xfe]),
      Buffer.alloc(2 * 1024 * 1024 + 1),
    ]) {
      await writeFile(file, data);
      await assert.rejects(loadProject(file));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saving invalid edits preserves the existing valid project', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-atomic-'));
  try {
    const file = path.join(dir, 'edit.reupmatic.json');
    const project = createProject(source, state());
    await saveProject(file, project);
    const before = await readFile(file);
    await assert.rejects(
      saveProject(file, { ...project, cues: [{ ...project.cues[0], end_ms: 0 }] }),
    );
    assert.deepEqual(await readFile(file), before);
    const changed = createProject(source, {
      ...state(),
      cues: [{ ...state().cues[0], text: 'Đã sửa' }],
    });
    await saveProject(file, changed);
    assert.deepEqual(await loadProject(file), changed);
    assert.deepEqual(await readdir(dir), ['edit.reupmatic.json']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('source overwrite checks include same path and hardlink aliases', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-protect-'));
  try {
    const original = path.join(dir, 'original.mp4');
    const alias = path.join(dir, 'alias.reupmatic.json');
    await writeFile(original, 'original media bytes');
    await link(original, alias);
    const digest = createHash('sha256')
      .update(await readFile(original))
      .digest('hex');
    const project = createProject({ path: original, sha256: digest }, state());
    await assert.rejects(protectSources(original, [original]), /SOURCE_OVERWRITE/);
    await assert.rejects(saveProject(alias, project), /SOURCE_OVERWRITE/);
    await assert.rejects(saveProject(original, project), /PROJECT_EXTENSION/);
    assert.equal(await readFile(original, 'utf8'), 'original media bytes');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runtime cue boundary rejects non-arrays and extra fields without raw TypeErrors', () => {
  for (const value of [undefined, null, {}, [null], [3], [{ ...state().cues[0], extra: true }]]) {
    assert.throws(() => assertCues(value), /INVALID_CUES/);
  }
});

test('a saved project carries its own voice track and reopens it unchanged', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-voice-'));
  try {
    const file = path.join(dir, 'voice.reupmatic.json');
    const project = createProject(source, { ...state(), voice_track: voiceTrack() });
    await saveProject(file, project);
    const restored = await loadProject(file);
    assert.deepEqual(restored, project);
    assert.deepEqual(restored.voice_track, voiceTrack());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('malformed voice tracks are rejected whole', () => {
  const good = createProject(source, state());
  for (const mutate of [
    (value) => {
      value.artifact.sha256 = 'nope';
    },
    (value) => {
      value.origin.layer = 'transcript';
    },
    (value) => {
      value.plan.lines[0].rate = 0;
    },
    (value) => {
      value.provenance.model_id = '';
    },
    (value) => {
      value.plan.conflicts = [{ ...value.plan.lines[0], overrun_ms: 5 }];
    },
    (value) => {
      value.token = 'secret';
    },
  ]) {
    const value = structuredClone(voiceTrack());
    mutate(value);
    assert.throws(() => parseProject({ ...good, voice_track: value }), /INVALID_VOICE_TRACK/);
  }
});

test('removing the voice track is one action and restores the previous audio arrangement', () => {
  const project = createProject(source, {
    ...state(),
    soundtrack: soundtrack(),
    voice_track: voiceTrack(),
  });
  const removed = withoutVoiceTrack(project);
  assert.equal('voice_track' in removed, false);
  assert.deepEqual(removed.soundtrack, soundtrack());
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(removed))), removed);
});

test('a failed retry preserves the previous good voice track', () => {
  let snapshot = editTextLayer(state(), 'spoken', [
    { id: 'cue-1', start_ms: 120, end_ms: 1500, text: 'Xin chào' },
  ]);
  const token = snapshot.text_layers.spoken.token;
  snapshot = {
    ...snapshot,
    voice_track: { ...voiceTrack(), origin: { kind: 'copy', layer: 'spoken', token } },
  };
  const project = createProject(source, snapshot);
  const cues = [{ id: 'cue-1', start_ms: 120, end_ms: 1500, text: 'Xin chào' }];
  const input = {
    request_id: 'request-12345678',
    revision: 1,
    params: {
      source_layer: 'spoken',
      source_token: token,
      language: 'vi',
      model_id: 'a'.repeat(64),
      voice_id: 'test-voice',
      cues,
    },
  };
  const result = {
    kind: 'synthesis',
    ...input.params,
    artifact_id: '22222222-2222-4222-8222-222222222222',
    sha256: 'd'.repeat(64),
    sample_rate: 48000,
    frames: 4800,
    duration_ms: 100,
    segments: [{ cue_id: 'cue-1', start_frame: 0, end_frame: 4800, lead_silence_frames: 0 }],
    mode: 'mix',
    runtime: 'controlled-sdk',
  };
  const plan = {
    engine_targets_duration: false,
    lines: [
      { cue_id: 'cue-1', offset_ms: 120, rate: 1, slot_ms: 1380, speech_ms: 100, overrun_ms: 0 },
    ],
    conflicts: [],
  };
  const settings = {
    engine: 'vieneu-v3-turbo-onnx',
    mode: 'mix',
    gain_db: 0,
    fade_in_ms: 0,
    fade_out_ms: 0,
  };
  const applied = applyVoiceResult(project, input, result, plan, settings);
  assert.equal(applied.voice_track.artifact.artifact_id, result.artifact_id);
  assert.equal(applied.voice_track.origin.token, token);
  // The spoken text changes, then a late result for the old capture arrives: it must not
  // replace the audio that still matches what the project holds.
  const edited = editTextLayer(applied, 'spoken', [
    { id: 'cue-1', start_ms: 120, end_ms: 1500, text: 'Xin chào bạn' },
  ]);
  assert.equal(edited.voice_track.stale, true);
  assert.throws(() => applyVoiceResult(edited, input, result, plan, settings), /STALE_OPERATION/);
  assert.equal(edited.voice_track.artifact.artifact_id, result.artifact_id);
  assert.deepEqual(edited.voice_track.plan, plan);
});
