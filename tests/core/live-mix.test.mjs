import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DUCK_ATTACK_MS,
  DUCK_RATIO,
  DUCK_THRESHOLD_MIN,
  duckGainReductionDb,
  duckKey,
  duckMusicGain,
  duckThreshold,
  duckThresholdDb,
  duckWorkletParams,
  envelopeCoefficients,
  fadeGainAt,
  soundtrackWindow,
  voiceLineSchedule,
  voiceWindow,
} from '../../dist-core/editing/live-mix.js';

// Values mirror worker/media/audio/mixing.py duck_parameters and duck_filter.
test('the live ducking curve matches the worker sidechain numbers', () => {
  assert.equal(DUCK_RATIO, 8);
  assert.equal(DUCK_ATTACK_MS, 20);
  assert.equal(duckThresholdDb(9), -18 - 9 / (1 - 1 / 8));
  assert.ok(Math.abs(duckThreshold(9) - 10 ** (duckThresholdDb(9) / 20)) < 1e-12);
});

test('a -18 dBFS key loses exactly the requested amount at ratio 8', () => {
  for (const amount of [3, 9, 12, 18]) {
    assert.ok(Math.abs(duckGainReductionDb(-18, amount) - amount) < 1e-9, `${amount} dB`);
    assert.ok(Math.abs(duckMusicGain(-18, amount) - 10 ** (-amount / 20)) < 1e-12);
  }
});

test('a key below the threshold is untouched and reduction grows with level', () => {
  assert.equal(duckGainReductionDb(duckThresholdDb(9), 9), 0);
  assert.equal(duckGainReductionDb(-60, 9), 0);
  assert.ok(duckGainReductionDb(-10, 9) > duckGainReductionDb(-20, 9));
  assert.ok(duckGainReductionDb(-20, 9) > duckGainReductionDb(-40, 9));
  assert.ok(duckGainReductionDb(0, 9) > 0);
});

test('the threshold is clamped to the same floor the worker uses', () => {
  assert.equal(duckThreshold(1000), DUCK_THRESHOLD_MIN);
  assert.ok(duckThreshold(1) <= 1);
});

test('envelope coefficients decay faster on attack than release', () => {
  const { attack, release } = envelopeCoefficients(48000, 20, 400);
  assert.ok(attack > 0 && attack < 1);
  assert.ok(release > 0 && release < 1);
  assert.ok(attack < release);
});

const voiceTrack = {
  artifact: {
    artifact_id: '11111111-1111-4111-8111-111111111111',
    sha256: 'b'.repeat(64),
    sample_rate: 48000,
    frames: 54000,
    duration_ms: 1125,
  },
  plan: {
    engine_targets_duration: false,
    lines: [
      { cue_id: 'cue-1', offset_ms: 0, rate: 1, slot_ms: 1500, speech_ms: 500, overrun_ms: 0 },
      { cue_id: 'cue-2', offset_ms: 1500, rate: 1.25, slot_ms: 500, speech_ms: 500, overrun_ms: 0 },
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
};

const soundtrack = {
  source: { path: '/music.wav', name: 'music.wav', sha256: 'a'.repeat(64), duration_ms: 5000 },
  mode: 'mix',
  start_ms: 0,
  end_ms: 4000,
  offset_ms: 1000,
  gain_db: -6,
  fade_in_ms: 1000,
  fade_out_ms: 500,
  duck: { enabled: true, amount_db: 9, release_ms: 300 },
  muted: false,
};

// Mirrors worker/media/audio/mixing.py voice_filters and soundtrack_filters.
test('voice line placement matches the worker frame spans and rate', () => {
  const lines = voiceLineSchedule(voiceTrack);
  assert.deepEqual(
    lines.map((line) => [line.output_start_ms, line.output_end_ms]),
    [
      [0, 500],
      [1500, 1900],
    ],
  );
  assert.deepEqual(
    lines.map((line) => [line.source_offset_s, line.source_duration_s]),
    [
      [0, 0.5],
      [0.625, 0.5],
    ],
  );
  assert.deepEqual(voiceWindow(voiceTrack), { start_ms: 0, end_ms: 1900 });
});

test('the soundtrack window keeps the worker trim and output offset', () => {
  assert.deepEqual(soundtrackWindow(soundtrack), { start_ms: 0, end_ms: 4000, offset_ms: 1000 });
});

test('fade envelopes ramp linearly on the same clock the worker fades', () => {
  // Music: in over [1000, 2000), out over [3500, 4000).
  assert.equal(fadeGainAt(1000, 1000, 4000, 1000, 500), 0);
  assert.equal(fadeGainAt(1500, 1000, 4000, 1000, 500), 0.5);
  assert.equal(fadeGainAt(2500, 1000, 4000, 1000, 500), 1);
  assert.equal(fadeGainAt(3750, 1000, 4000, 1000, 500), 0.5);
  assert.equal(fadeGainAt(4000, 1000, 4000, 1000, 500), 0);
  // Voice: in over [0, 100), out over [1700, 1900).
  assert.equal(fadeGainAt(0, 0, 1900, 100, 200), 0);
  assert.equal(fadeGainAt(50, 0, 1900, 100, 200), 0.5);
  assert.equal(fadeGainAt(1000, 0, 1900, 100, 200), 1);
  assert.equal(fadeGainAt(1800, 0, 1900, 100, 200), 0.5);
});

test('the ducking key matches the worker voice/original choice', () => {
  assert.equal(duckKey(voiceTrack, soundtrack, undefined, true), 'voice');
  assert.equal(duckKey({ ...voiceTrack, muted: true }, soundtrack, undefined, true), 'original');
  assert.equal(
    duckKey(undefined, { ...soundtrack, mode: 'replace' }, undefined, true),
    null,
    'a replace music lane leaves no original key',
  );
  assert.equal(
    duckKey(undefined, soundtrack, { audio: { muted: true, gain_db: 0 } }, true),
    null,
    'a muted original leaves no key',
  );
  assert.equal(
    duckKey(undefined, { ...soundtrack, muted: true }, undefined, true),
    null,
    'a muted music lane has nothing to duck',
  );
  assert.equal(
    duckKey(
      undefined,
      { ...soundtrack, duck: { ...soundtrack.duck, enabled: false } },
      undefined,
      true,
    ),
    null,
  );
});

test('the worklet parameters carry the shared threshold, ratio and time constants', () => {
  const params = duckWorkletParams(9, 300, 48000);
  assert.equal(params.thresholdDb, duckThresholdDb(9));
  assert.equal(params.amountDb, 9);
  assert.equal(params.ratio, DUCK_RATIO);
  assert.ok(params.attack > 0 && params.attack < 1);
  assert.ok(params.release > 0 && params.release < 1);
  assert.ok(params.attack < params.release);
});
