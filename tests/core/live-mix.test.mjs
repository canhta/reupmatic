import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DUCK_ATTACK_MS,
  DUCK_DETECTION_POWER,
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
  liveClipPlay,
  liveMixClockMs,
  liveMixClockRate,
  liveOutputClock,
  OUTPUT_CLOCK_UNITY,
  outputToSourceMs,
  previewElementRate,
  soundtrackSourceSpan,
  soundtrackWindow,
  stretchCache,
  voiceCuesOutsideOutput,
  voiceLineSchedule,
  voiceLineSpan,
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
    speed: 1,
    lines: [
      { cue_id: 'cue-1', offset_ms: 0, rate: 1, slot_ms: 1500, speech_ms: 500, overrun_ms: 0 },
      { cue_id: 'cue-2', offset_ms: 1500, rate: 1.2, slot_ms: 500, speech_ms: 500, overrun_ms: 0 },
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
      [1500, 1500 + 500 / 1.2],
    ],
  );
  assert.deepEqual(
    lines.map((line) => [line.source_offset_s, line.source_duration_s]),
    [
      [0, 0.5],
      [0.625, 0.5],
    ],
  );
  assert.deepEqual(voiceWindow(voiceTrack), { start_ms: 0, end_ms: 1500 + 500 / 1.2 });
});

test('the soundtrack window keeps the worker trim and output offset', () => {
  assert.deepEqual(soundtrackWindow(soundtrack), { start_ms: 0, end_ms: 4000, offset_ms: 1000 });
});

test('a trim and speed move the voice to the output clock the render uses', () => {
  const clock = { trimStartMs: 5000, speed: 2, durationMs: 10000 };
  assert.deepEqual(voiceLineSpan(6000, 500, 1, clock), {
    output_start_ms: 500,
    output_end_ms: 1000,
    head_ms: 0,
    tail_ms: 0,
  });
  // The trim cuts audio, never moves it: a line wholly before the trim start is gone.
  assert.equal(voiceLineSpan(1000, 500, 1, clock), null);
  assert.equal(voiceLineSpan(4000, 500, 1, clock), null, 'it ends exactly at the cut');
  // A line past the output end is gone as well.
  assert.equal(voiceLineSpan(25000, 500, 1, clock), null);
  const lines = voiceLineSchedule(voiceTrack, { trimStartMs: 1000, speed: 2, durationMs: 10000 });
  assert.deepEqual(
    lines.map((line) => [line.offset_ms, line.output_start_ms]),
    [[1500, 250]],
  );
  assert.deepEqual(voiceWindow(voiceTrack, { trimStartMs: 1000, speed: 2, durationMs: 10000 }), {
    start_ms: 250,
    end_ms: 250 + 500 / 1.2,
  });
});

test('a line straddling the trim start plays only its part after the cut', () => {
  const [first, second] = voiceLineSchedule(voiceTrack, {
    trimStartMs: 200,
    speed: 1,
    durationMs: 10000,
  });
  assert.equal(first.output_start_ms, 0);
  assert.equal(first.output_end_ms, 300);
  assert.equal(first.source_offset_s, 0.2);
  assert.ok(Math.abs(first.source_duration_s - 0.3) < 1e-12);
  assert.equal(second.output_start_ms, 1300);
  // A sped line consumes recording at its rate: 100 output ms cut = 120 recording ms.
  const [sped] = voiceLineSchedule(voiceTrack, { trimStartMs: 1600, speed: 1, durationMs: 10000 });
  assert.equal(sped.output_start_ms, 0);
  assert.ok(Math.abs(sped.source_offset_s - (0.625 + 0.12)) < 1e-12);
  assert.ok(Math.abs(sped.source_duration_s - (0.5 - 0.12)) < 1e-12);
});

test('a line straddling the trim end is cut at the end of the output', () => {
  const clock = { trimStartMs: 0, speed: 1, durationMs: 1600 };
  const lines = voiceLineSchedule(voiceTrack, clock);
  assert.equal(lines.length, 2);
  assert.equal(lines[1].output_end_ms, 1600);
  assert.ok(
    Math.abs(lines[1].source_duration_s - (0.5 - (1500 + 500 / 1.2 - 1600) * 0.0012)) < 1e-12,
  );
  assert.deepEqual(voiceWindow(voiceTrack, clock), { start_ms: 0, end_ms: 1600 });
  assert.equal(voiceLineSchedule(voiceTrack, { ...clock, durationMs: 1500 }).length, 1);
});

test('the lines a trim cuts away are named so no review counts them as long', () => {
  const clock = { trimStartMs: 1000, speed: 2, durationMs: 10000 };
  assert.deepEqual([...voiceCuesOutsideOutput(voiceTrack.plan, clock)], ['cue-1']);
  assert.deepEqual([...voiceCuesOutsideOutput(voiceTrack.plan, OUTPUT_CLOCK_UNITY)], []);
});

test('a single video runs the live mix on the export output clock', () => {
  const editing = { trim: { start_ms: 5000, end_ms: 20000 }, speed: 2 };
  const clock = liveOutputClock(editing, 30000);
  assert.deepEqual(clock, { trimStartMs: 5000, speed: 2, durationMs: 7500 });
  assert.deepEqual(liveOutputClock(undefined, 30000), {
    trimStartMs: 0,
    speed: 1,
    durationMs: 30000,
  });
  assert.deepEqual(liveOutputClock({ speed: 0.5 }, 30000), {
    trimStartMs: 0,
    speed: 0.5,
    durationMs: 60000,
  });
  // Until the source length is known the output is unbounded.
  assert.deepEqual(liveOutputClock(undefined, 0), OUTPUT_CLOCK_UNITY);
  // The element plays source time; the mix reads where that frame lands in the export.
  assert.equal(liveMixClockMs(false, 7000, 0, clock), 1000);
  assert.equal(liveMixClockMs(false, 5000, 0, clock), 0);
  // Before the trim start the export has not begun: the clock is negative, nothing plays yet.
  assert.equal(liveMixClockMs(false, 4000, 0, clock), -500);
  assert.equal(liveMixClockMs(true, 7000, 9000, OUTPUT_CLOCK_UNITY), 9000);
});

test('output time maps back to the source frame the export shows there', () => {
  const clock = { trimStartMs: 5000, speed: 2 };
  assert.equal(outputToSourceMs(0, clock), 5000);
  assert.equal(outputToSourceMs(1000, clock), 7000);
  assert.equal(outputToSourceMs(1000, OUTPUT_CLOCK_UNITY), 1000);
  for (const source of [5000, 6250, 13333]) {
    assert.equal(outputToSourceMs(liveMixClockMs(false, source, 0, clock), clock), source);
  }
});

test('the music lane sits on the source frames it plays under in the export', () => {
  // Music plays at 1x from its output offset; on a source-time timeline a 2x clip covers twice
  // the source in that time.
  const clock = { trimStartMs: 5000, speed: 2 };
  assert.deepEqual(soundtrackSourceSpan(soundtrack, clock), { start_ms: 7000, end_ms: 15000 });
  assert.deepEqual(soundtrackSourceSpan(soundtrack, OUTPUT_CLOCK_UNITY), {
    start_ms: 1000,
    end_ms: 5000,
  });
});

test('a voice line starts when the picture reaches its cue, as in the export', () => {
  const cueStart = 6000;
  const source = {
    ...voiceTrack,
    plan: {
      ...voiceTrack.plan,
      lines: [{ ...voiceTrack.plan.lines[0], cue_id: 'cue-1', offset_ms: cueStart }],
    },
    segments: [voiceTrack.segments[0]],
  };
  const clock = liveOutputClock({ trim: { start_ms: 5000, end_ms: 20000 }, speed: 2 }, 30000);
  const [line] = voiceLineSchedule(source, clock);
  // The export's placement: (cue − trim start) / speed.
  assert.equal(line.output_start_ms, 500);
  // The element reaches the cue's source frame exactly when the output clock reaches the line.
  assert.equal(liveMixClockMs(false, cueStart, 0, clock), line.output_start_ms);
  // The line keeps its own length: the export speeds the picture, not the voice.
  assert.equal(line.output_end_ms - line.output_start_ms, 500);
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

test('a composition takes the edit window over its own timeline, as the export does', () => {
  // The export assembles the composition, then trims and speeds it like a single source.
  const editing = { trim: { start_ms: 2000, end_ms: 12000 }, speed: 2 };
  const clock = liveOutputClock(editing, 20000);
  assert.deepEqual(clock, { trimStartMs: 2000, speed: 2, durationMs: 5000 });
  // The mix reads the composition timeline, not the playing clip's source time.
  assert.equal(liveMixClockMs(true, 4200, 9000, clock), 3500);
  assert.equal(liveMixClockMs(false, 9000, 4200, clock), 3500);
  // A clip at its own 1.5x plays at 3x under a 2x edit, and the mix clock still runs at 1x.
  assert.equal(previewElementRate(1.5, clock.speed), 3);
  assert.equal(previewElementRate(1.2, 1.5), 1.8);
  assert.equal(previewElementRate(1, 1), 1);
  assert.equal(liveMixClockRate(true, 3, clock), 1);
});

test('a composed live mix runs on the output clock, not the playing clip source time', () => {
  assert.equal(liveMixClockMs(true, 4200, 9000, OUTPUT_CLOCK_UNITY), 9000);
  assert.equal(liveMixClockMs(false, 4200, 9000, OUTPUT_CLOCK_UNITY), 4200);
  assert.equal(liveMixClockRate(true, 1.5, OUTPUT_CLOCK_UNITY), 1);
  assert.equal(liveMixClockRate(false, 1.5, OUTPUT_CLOCK_UNITY), 1.5);
});

test('a single video playing at its clip speed hands the mix an output clock at 1x', () => {
  const clock = { trimStartMs: 0, speed: 1.5 };
  assert.equal(liveMixClockRate(false, 1.5, clock), 1);
  assert.equal(liveMixClockRate(false, 0.25, { trimStartMs: 0, speed: 0.25 }), 1);
  assert.equal(liveMixClockRate(false, 1.1, { trimStartMs: 0, speed: 1.1 }), 1);
  // Until the element takes the new speed, the output clock runs at the ratio.
  assert.equal(liveMixClockRate(false, 1, { trimStartMs: 0, speed: 2 }), 0.5);
  // So music plays straight from the file and a sped line stretches at its own rate only.
  const rate = liveMixClockRate(false, 1.5, clock);
  assert.equal(liveClipPlay({ id: 'music', source_offset_s: 10, rate: 1 }, rate, 1, 3).tempo, 1);
  assert.equal(
    liveClipPlay({ id: 'voice:1', source_offset_s: 0, rate: 1.2 }, rate, 0, 1).tempo,
    1.2,
  );
});

test('the live detector follows FFmpeg RMS (squared) detection, not the peak', () => {
  assert.equal(DUCK_DETECTION_POWER, 2);
  assert.equal(duckWorkletParams(9, 300, 48000).power, DUCK_DETECTION_POWER);
});

test('a natural clip at 1x plays straight from the recording, no stretch', () => {
  const play = liveClipPlay({ id: 'voice:0', source_offset_s: 4, rate: 1 }, 1, 0.5, 1.5);
  assert.equal(play.tempo, 1);
  assert.equal(play.offset_s, 4.5);
  assert.equal(play.duration_s, 1.5);
});

test('a playback rate is folded into one pitch-kept stretch played at 1x', () => {
  // Output seconds are clock time: at 2x a second of output passes in half a second.
  const fast = liveClipPlay({ id: 'music', source_offset_s: 10, rate: 1 }, 2, 1, 3);
  assert.deepEqual(fast, { key: 'music@2', tempo: 2, offset_s: 0.5, duration_s: 1.5 });
  const slow = liveClipPlay({ id: 'music', source_offset_s: 10, rate: 1 }, 0.5, 1, 3);
  assert.deepEqual(slow, { key: 'music@0.5', tempo: 0.5, offset_s: 2, duration_s: 6 });
  const sped = liveClipPlay({ id: 'voice:3', source_offset_s: 2, rate: 1.15 }, 1, 0.2, 0.8);
  assert.deepEqual(sped, { key: 'voice:3@1.15', tempo: 1.15, offset_s: 0.2, duration_s: 0.8 });
});

test('a sped line on a sped clock stretches once, at the product of both rates', () => {
  const play = liveClipPlay({ id: 'voice:1', source_offset_s: 0, rate: 1.2 }, 1.5, 0, 1);
  assert.equal(play.tempo, 1.8);
  assert.equal(play.key, 'voice:1@1.8');
  // Rates that cancel out need no copy: the recording at 1x is already the right tempo.
  const cancelled = liveClipPlay({ id: 'voice:1', source_offset_s: 3, rate: 1.25 }, 0.8, 0.4, 1);
  assert.equal(cancelled.tempo, 1);
  assert.equal(cancelled.offset_s, 3.5);
});

test('stretched clips are built once per playback rate and dropped when it changes', () => {
  const cache = stretchCache();
  let built = 0;
  const make = () => ({ built: ++built });
  const first = cache(1, 'voice:0@1.1', make);
  assert.equal(cache(1, 'voice:0@1.1', make), first);
  assert.notEqual(cache(1, 'voice:1@1.1', make), first);
  assert.equal(built, 2);
  cache(2, 'voice:0@2.2', make);
  assert.equal(built, 3);
  // Back at 1x the old copies are gone: one rate's clips are held at a time.
  assert.notEqual(cache(1, 'voice:0@1.1', make), first);
  assert.equal(built, 4);
});
