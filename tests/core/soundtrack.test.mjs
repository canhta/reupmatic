import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSoundtrack } from '../../dist-core/editing/soundtrack.js';
import {
  changeEditor,
  openEditorHistory,
  undoEditor,
} from '../../dist-core/projects/editor-history.js';
import { createProject, parseProject } from '../../dist-core/projects/project.js';
import { voiceMix } from '../../dist-core/rendering/voice-mix.js';
import { parseVoiceTrack } from '../../dist-core/speech/synthesis/voice-track.js';

const track = {
  source: { path: '/music.wav', name: 'music.wav', sha256: 'b'.repeat(64), duration_ms: 9000 },
  mode: 'mix',
  start_ms: 1000,
  end_ms: 6000,
  offset_ms: 2000,
  gain_db: -6,
  fade_in_ms: 300,
  fade_out_ms: 500,
  duck: { enabled: true, amount_db: 12, release_ms: 250 },
  muted: false,
};
test('soundtrack remains a per-document asset, with strict current project and undo support', () => {
  const snapshot = {
    cues: [],
    soundtrack: parseSoundtrack(track),
  };
  const project = createProject({ path: '/video.mp4', sha256: 'a'.repeat(64) }, snapshot);
  assert.deepEqual(parseProject(project).soundtrack, track);
  const history = changeEditor(openEditorHistory(snapshot), { soundtrack: undefined });
  assert.equal('soundtrack' in history.present, false);
  assert.deepEqual(undoEditor(history).present.soundtrack, track);
});
test('invalid paths, hashes, audio bounds, fades, and arbitrary worker inputs are rejected', () => {
  for (const patch of [
    { mode: 'loop' },
    { end_ms: 10000 },
    { end_ms: 1000 },
    { gain_db: Infinity },
    { fade_in_ms: 6000 },
    { offset_ms: -1 },
    { script: 'run' },
    { source: { ...track.source, sha256: 'changed' } },
    { source: { ...track.source, path: 'https://example.com/music' } },
    { duck: { enabled: 'yes', amount_db: 12, release_ms: 250 } },
    { duck: { enabled: true, amount_db: 0, release_ms: 250 } },
    { duck: { enabled: true, amount_db: 12, release_ms: 5 } },
    { duck: { enabled: true, amount_db: 12 } },
  ]) {
    assert.throws(() => parseSoundtrack({ ...track, ...patch }), /INVALID_SOUNDTRACK/);
  }
  // A lane mute is a required part of the one current shape; a missing flag is refused, never
  // default-filled, so an old dev document fails loudly.
  const { muted, ...withoutMute } = track;
  assert.equal(muted, false);
  assert.throws(() => parseSoundtrack(withoutMute), /INVALID_SOUNDTRACK/);
});

const voiceTrackFixture = () => ({
  artifact: {
    artifact_id: '11111111-1111-4111-8111-111111111111',
    sha256: 'b'.repeat(64),
    sample_rate: 48000,
    frames: 60000,
    duration_ms: 1250,
  },
  plan: {
    engine_targets_duration: false,
    lines: [
      { cue_id: 'cue-1', offset_ms: 0, rate: 1, slot_ms: 1000, speech_ms: 500, overrun_ms: 0 },
      {
        cue_id: 'cue-2',
        offset_ms: 1500,
        rate: 1.25,
        slot_ms: 1000,
        speech_ms: 500,
        overrun_ms: 0,
      },
    ],
    conflicts: [],
  },
  segments: [
    { cue_id: 'cue-1', start_frame: 0, end_frame: 24000, lead_silence_frames: 0 },
    { cue_id: 'cue-2', start_frame: 30000, end_frame: 54000, lead_silence_frames: 6000 },
  ],
  mode: 'mix',
  gain_db: -3,
  fade_in_ms: 100,
  fade_out_ms: 200,
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

test('the voice mix carries each line at its planned offset and rate, never the whole recording', () => {
  const mix = voiceMix(voiceTrackFixture());
  assert.equal(mix.mode, 'mix');
  assert.equal(mix.sample_rate, 48000);
  assert.equal(mix.gain_db, -3);
  assert.equal(mix.fade_in_ms, 100);
  assert.equal(mix.fade_out_ms, 200);
  assert.equal(mix.sha256, 'b'.repeat(64));
  // Placement comes from the plan; the spans come from the artifact's own frames. The producer's
  // 6000-frame lead padding is never placed, and the whole recording is never dropped at one
  // offset.
  assert.deepEqual(mix.lines, [
    { offset_ms: 0, rate: 1, start_frame: 0, end_frame: 24000 },
    { offset_ms: 1500, rate: 1.25, start_frame: 30000, end_frame: 54000 },
  ]);
});

test('a voice mix whose plan and spans disagree is refused rather than placed', () => {
  const disagreeing = voiceTrackFixture();
  disagreeing.plan = {
    ...disagreeing.plan,
    lines: [
      { cue_id: 'cue-1', offset_ms: 0, rate: 1, slot_ms: 1000, speech_ms: 999, overrun_ms: 0 },
      disagreeing.plan.lines[1],
    ],
  };
  assert.throws(() => voiceMix(disagreeing), /INVALID_VOICE/);
  const missing = voiceTrackFixture();
  missing.segments = [missing.segments[0]];
  assert.throws(() => voiceMix(missing), /INVALID_VOICE/);
  const duplicate = voiceTrackFixture();
  duplicate.segments = [duplicate.segments[0], { ...duplicate.segments[0], cue_id: 'cue-1' }];
  assert.throws(() => voiceMix(duplicate), /INVALID_VOICE/);
});

test('the voice lane mute is part of the current track and is never default-filled', () => {
  const track = voiceTrackFixture();
  assert.equal(voiceMix(track).muted, false);
  const muted = parseVoiceTrack({ ...track, muted: true });
  assert.equal(muted.muted, true);
  assert.equal(voiceMix(muted).muted, true);
  const { muted: _omit, ...without } = track;
  assert.throws(() => parseVoiceTrack(without), /INVALID_VOICE_TRACK/);
});
