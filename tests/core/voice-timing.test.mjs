import assert from 'node:assert/strict';
import test from 'node:test';
import { engineTargetsDuration } from '../../dist-core/speech/engine-capability.js';
import {
  planVoiceTiming,
  SHIPPED_VOICE_TIMING_POLICY,
} from '../../dist-core/speech/synthesis/timing.js';

const rate = 48000;
const cue = (id, start_ms, end_ms) => ({ id, start_ms, end_ms, text: id });
const segment = (cue_id, speech_ms, lead_ms = 0, sample_rate = rate) => {
  const lead = Math.round((lead_ms * sample_rate) / 1000);
  const speech = Math.round((speech_ms * sample_rate) / 1000);
  return { cue_id, start_frame: lead, end_frame: lead + speech, lead_silence_frames: lead };
};
const policy = (overrides = {}) => ({
  rate_bound: 1,
  acceptable_overrun_ms: 0,
  ...overrides,
});
function plan(cues, segments, overrides = {}) {
  return planVoiceTiming({
    cues,
    segments,
    sample_rate: rate,
    engine_targets_duration: false,
    policy: policy(),
    ...overrides,
  });
}
const line = (value, id) => value.lines.find((entry) => entry.cue_id === id);

test('the capability says which architectures target a duration; it is consulted, not assumed', () => {
  assert.equal(engineTargetsDuration('vieneu-v3-turbo-onnx'), false);
  assert.equal(engineTargetsDuration('vieneu-v3-nano-onnx'), true);
  assert.equal(engineTargetsDuration('an-engine-this-build-does-not-know'), false);
});

test('a slot-fitted line from the duration-targeting engine plans at unity with no conflict', () => {
  // The nano engine's own duration predictor fitted two 2 s slots at its 24 kHz rate; the plan
  // consults the capability seam and applies no host rate factor.
  const cues = [cue('a', 0, 2000), cue('b', 2000, 4000)];
  const segments = [
    { cue_id: 'a', start_frame: 0, end_frame: 48000, lead_silence_frames: 0 },
    { cue_id: 'b', start_frame: 48000, end_frame: 96000, lead_silence_frames: 0 },
  ];
  const value = plan(cues, segments, {
    sample_rate: 24000,
    engine_targets_duration: engineTargetsDuration('vieneu-v3-nano-onnx'),
  });
  assert.deepEqual(
    value.lines.map((entry) => [entry.rate, entry.speech_ms, entry.overrun_ms]),
    [
      [1, 2000, 0],
      [1, 2000, 0],
    ],
  );
  assert.deepEqual(value.conflicts, []);
});

test('a line that fits its slot is anchored to its cue start and never slowed or shifted', () => {
  const value = plan(
    [cue('a', 0, 1000), cue('b', 2000, 3000)],
    [segment('a', 800), segment('b', 900)],
  );
  assert.deepEqual(line(value, 'a'), {
    cue_id: 'a',
    offset_ms: 0,
    rate: 1,
    slot_ms: 2000,
    speech_ms: 800,
    overrun_ms: 0,
  });
  assert.equal(line(value, 'b').offset_ms, 2000);
  assert.equal(line(value, 'b').slot_ms, 1000);
  assert.deepEqual(value.conflicts, []);
});

test('a line that overruns its own cue but not its slot uses the following silence', () => {
  const value = plan(
    [cue('a', 0, 1000), cue('b', 2000, 3000)],
    [segment('a', 1500), segment('b', 500)],
  );
  assert.equal(line(value, 'a').rate, 1);
  assert.equal(line(value, 'a').overrun_ms, 0);
  assert.deepEqual(value.conflicts, []);
});

test('a line exceeding its slot is compressed up to the bound and lands exactly in its slot', () => {
  const value = plan(
    [cue('a', 0, 1000), cue('b', 1000, 2000)],
    [segment('a', 1500), segment('b', 500)],
    { policy: policy({ rate_bound: 2 }) },
  );
  const a = line(value, 'a');
  assert.equal(a.slot_ms, 1000);
  assert.equal(a.speech_ms, 1500);
  assert.equal(a.rate, 1.5);
  assert.equal(a.overrun_ms, 0);
  assert.deepEqual(value.conflicts, []);
});

test('the shipped bound is unity: nothing is compressed and every overrun is a conflict', () => {
  // The bound this build ships is neutral by design — no real model weights have been measured, so
  // there is no evidenced number to ship. At unity a line that does not fit is reported, not
  // silently squeezed, which is the honest behaviour until ticket 07 raises the bound with evidence.
  assert.deepEqual(SHIPPED_VOICE_TIMING_POLICY, { rate_bound: 1, acceptable_overrun_ms: 0 });
  const value = plan(
    [cue('a', 0, 1000), cue('b', 1000, 2000)],
    [segment('a', 1500), segment('b', 500)],
    { policy: SHIPPED_VOICE_TIMING_POLICY },
  );
  assert.equal(line(value, 'a').rate, 1);
  assert.equal(line(value, 'a').overrun_ms, 500);
  assert.deepEqual(value.conflicts, [value.lines[0]]);
});

test('raising the bound is one parameter: the same input compresses instead of conflicting', () => {
  // No code path changes between these two calls — the bound is read as a parameter, so ticket 07
  // raising it is a value change alone. The raised bound is passed in explicitly, never defaulted.
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000)];
  const segments = [segment('a', 1500), segment('b', 500)];
  const shipped = plan(cues, segments, { policy: SHIPPED_VOICE_TIMING_POLICY });
  const raised = plan(cues, segments, {
    policy: { ...SHIPPED_VOICE_TIMING_POLICY, rate_bound: 2 },
  });
  assert.deepEqual(
    shipped.lines.map((entry) => [entry.cue_id, entry.offset_ms]),
    raised.lines.map((entry) => [entry.cue_id, entry.offset_ms]),
  );
  assert.equal(line(shipped, 'a').rate, 1);
  assert.deepEqual(shipped.conflicts, [shipped.lines[0]]);
  const a = line(raised, 'a');
  assert.equal(a.rate, 1.5);
  // The rate factor places the speech exactly in its slot: 1500 ms / 1.5 == the 1000 ms slot.
  assert.equal(Math.floor(a.speech_ms / a.rate), a.slot_ms);
  assert.equal(a.overrun_ms, 0);
  assert.deepEqual(raised.conflicts, []);
});

test('a bound below unity is refused rather than used to slow speech', () => {
  // Slowing a line to fill a gap is never an outcome. The plan refuses a sub-unity bound; the
  // worker boundary independently refuses a placed rate below 1 (its schema minimum and the same
  // check in `resolve_voice`), so no configuration can stretch speech.
  for (const rate_bound of [0, 0.5, 0.999]) {
    assert.throws(
      () => plan([cue('a', 0, 1000)], [segment('a', 1500)], { policy: policy({ rate_bound }) }),
      /VOICE_TIMING_INVALID/,
    );
  }
});

test('a line that exceeds the bound is reported with its identity, slot, speech and overrun', () => {
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000)];
  const segments = [segment('a', 1500), segment('b', 500)];
  for (const [bound, tolerance, expected] of [
    [1, 0, { rate: 1, overrun_ms: 500 }],
    [1.2, 0, { rate: 1.2, overrun_ms: 250 }],
  ]) {
    const value = plan(cues, segments, {
      policy: policy({ rate_bound: bound, acceptable_overrun_ms: tolerance }),
    });
    const a = line(value, 'a');
    assert.equal(a.rate, expected.rate);
    assert.equal(a.overrun_ms, expected.overrun_ms);
    assert.deepEqual(value.conflicts, [a]);
    assert.equal(a.cue_id, 'a');
    assert.equal(a.slot_ms, 1000);
    assert.equal(a.speech_ms, 1500);
  }
});

test('a residual overrun within the tolerated bound is placed rather than reported', () => {
  const value = plan(
    [cue('a', 0, 1000), cue('b', 1000, 2000)],
    [segment('a', 1500), segment('b', 500)],
    { policy: policy({ rate_bound: 1.2, acceptable_overrun_ms: 300 }) },
  );
  assert.equal(line(value, 'a').overrun_ms, 250);
  assert.deepEqual(value.conflicts, []);
});

test('adjacent lines that would collide conflict on the earlier line, which is never pushed later', () => {
  const value = plan(
    [cue('a', 0, 2000), cue('b', 2000, 4000)],
    [segment('a', 2600), segment('b', 500)],
  );
  assert.equal(line(value, 'a').offset_ms, 0);
  assert.equal(line(value, 'a').overrun_ms, 600);
  assert.equal(value.conflicts.length, 1);
  assert.equal(value.conflicts[0].cue_id, 'a');
  // The following line keeps its own anchor; drift into it is a reported conflict, not a shift.
  assert.equal(line(value, 'b').offset_ms, 2000);
  assert.equal(line(value, 'b').overrun_ms, 0);
});

test('a zero-length gap leaves the slot at the cue duration', () => {
  for (const [speech_ms, overrun_ms, conflicts] of [
    [1000, 0, 0],
    [1100, 100, 1],
  ]) {
    const value = plan(
      [cue('a', 0, 1000), cue('b', 1000, 2000)],
      [segment('a', speech_ms), segment('b', 200)],
    );
    assert.equal(line(value, 'a').slot_ms, 1000);
    assert.equal(line(value, 'a').overrun_ms, overrun_ms);
    assert.equal(value.conflicts.length, conflicts);
  }
});

test('a single line uses its own cue end as its slot', () => {
  const fits = plan([cue('solo', 0, 1500)], [segment('solo', 1500)]);
  assert.equal(line(fits, 'solo').slot_ms, 1500);
  assert.equal(line(fits, 'solo').rate, 1);
  assert.deepEqual(fits.conflicts, []);
  const overruns = plan([cue('solo', 0, 1500)], [segment('solo', 1800)]);
  assert.equal(line(overruns, 'solo').overrun_ms, 300);
  assert.deepEqual(overruns.conflicts, [overruns.lines[0]]);
});

test('the maximum supported line count plans without a conflict when every line fits', () => {
  const cues = Array.from({ length: 100 }, (_, index) =>
    cue(`line-${index}`, index * 1000, index * 1000 + 1000),
  );
  const segments = cues.map((entry) => segment(entry.id, 900));
  const value = plan(cues, segments);
  assert.equal(value.lines.length, 100);
  assert.deepEqual(value.conflicts, []);
  assert.equal(line(value, 'line-99').slot_ms, 1000);
  assert.ok(value.lines.every((entry) => entry.rate === 1));
});

test('an engine that targets a duration applies no host rate; one that cannot does', () => {
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000)];
  const segments = [segment('a', 1500), segment('b', 500)];
  const host = plan(cues, segments, { policy: policy({ rate_bound: 2 }) });
  const engine = plan(cues, segments, {
    engine_targets_duration: true,
    policy: policy({ rate_bound: 2 }),
  });
  // One shape, two behaviours: the same fields, the same offsets, a different rate decision.
  assert.deepEqual(Object.keys(host.lines[0]).sort(), Object.keys(engine.lines[0]).sort());
  assert.deepEqual(
    host.lines.map((entry) => [entry.cue_id, entry.offset_ms]),
    [
      ['a', 0],
      ['b', 1000],
    ],
  );
  assert.deepEqual(
    host.lines.map((entry) => entry.offset_ms),
    engine.lines.map((entry) => entry.offset_ms),
  );
  assert.equal(host.engine_targets_duration, false);
  assert.equal(engine.engine_targets_duration, true);
  assert.equal(line(host, 'a').rate, 1.5);
  assert.deepEqual(host.conflicts, []);
  assert.equal(line(engine, 'a').rate, 1);
  assert.equal(line(engine, 'a').overrun_ms, 500);
  assert.deepEqual(engine.conflicts, [engine.lines[0]]);
});

test('a sub-millisecond frame residual is not a conflict, because the clock is whole milliseconds', () => {
  // 14686 frames at 44.1 kHz is 333.015… ms on a 333 ms slot — a fraction of one frame past the
  // slot. That is below the composition clock's own resolution, so it is a rounding artefact, not
  // a placement that collides. A duration-targeting engine that lands one frame long must plan
  // cleanly here, or ticket 09's "lines that fit without host-side compression" cannot hold.
  const cues = [cue('a', 0, 333), cue('b', 333, 666)];
  const segments = [
    { cue_id: 'a', start_frame: 0, end_frame: 14686, lead_silence_frames: 0 },
    { cue_id: 'b', start_frame: 14686, end_frame: 29372, lead_silence_frames: 0 },
  ];
  const value = plan(cues, segments, { sample_rate: 44100, engine_targets_duration: true });
  assert.equal(line(value, 'a').speech_ms, 333);
  assert.equal(line(value, 'a').slot_ms, 333);
  assert.equal(line(value, 'a').overrun_ms, 0);
  assert.deepEqual(value.conflicts, []);
});

test('a full millisecond of overrun is still reported on the same clock', () => {
  // 14730 frames at 44.1 kHz is 334.013… ms on a 333 ms slot: at least one whole clock tick past
  // the slot, so quantising down must not widen the threshold and hide it. The same boundary holds
  // when the host, not the engine, owns the fit.
  const cues = [cue('a', 0, 333), cue('b', 333, 666)];
  const segments = (end) => [
    { cue_id: 'a', start_frame: 0, end_frame: end, lead_silence_frames: 0 },
    { cue_id: 'b', start_frame: end, end_frame: end + 14686, lead_silence_frames: 0 },
  ];
  const host = plan(cues, segments(14730), { sample_rate: 44100 });
  const engine = plan(cues, segments(14730), {
    sample_rate: 44100,
    engine_targets_duration: true,
  });
  for (const value of [host, engine]) {
    assert.equal(line(value, 'a').speech_ms, 334);
    assert.equal(line(value, 'a').overrun_ms, 1);
    assert.deepEqual(value.conflicts, [value.lines[0]]);
  }
});

test('speech is measured as speech, never as the raw frame span including inserted silence', () => {
  // Line b's segment begins after 250 ms of pipeline-inserted silence and speaks for only 400 ms,
  // so its raw span from the previous segment end is 650 ms while its speech extent is 400 ms.
  const cues = [cue('a', 0, 1000), cue('b', 1000, 1600)];
  const segments = [
    { cue_id: 'a', start_frame: 0, end_frame: 48000, lead_silence_frames: 0 },
    { cue_id: 'b', start_frame: 60000, end_frame: 79200, lead_silence_frames: 12000 },
  ];
  const value = plan(cues, segments);
  assert.equal(line(value, 'b').speech_ms, 400);
  assert.equal(line(value, 'b').slot_ms, 600);
  assert.equal(line(value, 'b').overrun_ms, 0);
  assert.deepEqual(value.conflicts, []);
});

test('the plan measures at the rate the result reports, not at a fixed rate', () => {
  const value = plan(
    [cue('a', 0, 1000), cue('b', 1000, 2000)],
    [segment('a', 1500, 0, 24000), segment('b', 500, 0, 24000)],
    { sample_rate: 24000, policy: policy({ rate_bound: 2 }) },
  );
  assert.equal(line(value, 'a').speech_ms, 1500);
  assert.equal(line(value, 'a').rate, 1.5);
  assert.deepEqual(value.conflicts, []);
});

test('the plan refuses a malformed input loudly rather than planning around it', () => {
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000)];
  const segments = [segment('a', 1500), segment('b', 500)];
  for (const overrides of [
    { sample_rate: 0 },
    { sample_rate: Number.NaN },
    { policy: policy({ rate_bound: 0.5 }) },
    { policy: policy({ acceptable_overrun_ms: -1 }) },
    { segments: [segments[0]] },
    { segments: [segments[0], segment('unknown', 500)] },
  ]) {
    assert.throws(() => plan(cues, segments, overrides), /VOICE_TIMING_INVALID/);
  }
});
