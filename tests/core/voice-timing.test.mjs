import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { engineTargetsDuration } from '../../dist-core/speech/engine-capability.js';
import {
  MAX_VOICE_SPEED,
  planVoiceTiming,
  refitVoiceTiming,
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
    speed: 1,
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

test('the shipped cap is 1.2x: nothing past it is sped further, and the overrun is a conflict', () => {
  assert.equal(MAX_VOICE_SPEED, 1.2);
  assert.deepEqual(SHIPPED_VOICE_TIMING_POLICY, {
    rate_bound: MAX_VOICE_SPEED,
    acceptable_overrun_ms: 0,
  });
  const value = plan(
    [cue('a', 0, 1000), cue('b', 1000, 2000)],
    [segment('a', 1500), segment('b', 500)],
    { policy: SHIPPED_VOICE_TIMING_POLICY },
  );
  assert.equal(line(value, 'a').rate, 1.2);
  assert.equal(line(value, 'a').overrun_ms, 250);
  assert.deepEqual(value.conflicts, [value.lines[0]]);
});

test('a line that fits at natural speed is never sped up under the shipped cap', () => {
  const value = plan(
    [cue('a', 0, 1000), cue('b', 1000, 2000)],
    [segment('a', 1000), segment('b', 400)],
    { policy: SHIPPED_VOICE_TIMING_POLICY },
  );
  assert.ok(value.lines.every((entry) => entry.rate === 1));
  assert.deepEqual(value.conflicts, []);
});

test('a line within the cap is sped exactly enough to fill its slot, never faster', () => {
  for (const [speech_ms, slot_ms] of [
    [1100, 1000],
    [1200, 1000],
    [1001, 997],
    [2399, 2000],
    [7, 6],
  ]) {
    const value = plan(
      [cue('a', 0, slot_ms), cue('b', slot_ms, slot_ms + 1000)],
      [segment('a', speech_ms), segment('b', 500)],
      { policy: SHIPPED_VOICE_TIMING_POLICY },
    );
    const a = line(value, 'a');
    assert.equal(a.rate, speech_ms / slot_ms, `${speech_ms}/${slot_ms}`);
    assert.ok(a.rate > 1 && a.rate <= MAX_VOICE_SPEED);
    assert.ok(Math.abs(a.speech_ms / a.rate - a.slot_ms) < 1e-9);
    assert.equal(a.overrun_ms, 0);
    assert.deepEqual(value.conflicts, []);
  }
});

test('a line needing more than the cap stays a conflict at the cap', () => {
  const value = plan(
    [cue('a', 0, 1000), cue('b', 1000, 2000)],
    [segment('a', 1203), segment('b', 500)],
    { policy: SHIPPED_VOICE_TIMING_POLICY },
  );
  const a = line(value, 'a');
  assert.equal(a.rate, MAX_VOICE_SPEED);
  assert.equal(a.overrun_ms, 2);
  assert.deepEqual(value.conflicts, [a]);
});

test('a zero-length slot cannot be sped into: speech conflicts, silence does not', () => {
  const spoken = plan([cue('a', 500, 500)], [segment('a', 300)], {
    policy: SHIPPED_VOICE_TIMING_POLICY,
  });
  assert.equal(line(spoken, 'a').slot_ms, 0);
  assert.equal(line(spoken, 'a').rate, MAX_VOICE_SPEED);
  assert.equal(line(spoken, 'a').overrun_ms, 250);
  assert.deepEqual(spoken.conflicts, [spoken.lines[0]]);
  const silent = plan([cue('a', 500, 500)], [segment('a', 0)], {
    policy: SHIPPED_VOICE_TIMING_POLICY,
  });
  assert.equal(line(silent, 'a').rate, 1);
  assert.deepEqual(silent.conflicts, []);
});

test('the persisted and worker contracts cap a line at the same speed as the plan', () => {
  const schema = (name) =>
    JSON.parse(readFileSync(new URL(`../../contracts/${name}`, import.meta.url), 'utf8'));
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties?.rate && node.properties?.start_frame !== undefined)
      found.push(node.properties.rate);
    if (node.properties?.rate && node.properties?.slot_ms !== undefined)
      found.push(node.properties.rate);
    for (const child of Object.values(node)) walk(child);
  };
  walk(schema('project.source.schema.json'));
  walk(schema('worker-request.source.schema.json'));
  assert.ok(found.length >= 3);
  for (const rate of found)
    assert.deepEqual(rate, { type: 'number', minimum: 1, maximum: MAX_VOICE_SPEED });
});

test('a bound below unity is refused rather than used to slow speech', () => {
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

// The export speeds the picture, so a caption's slot in the file is its timeline slot / speed.
test('at 1.5x a line is fitted to its caption slot in the exported file', () => {
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000)];
  const value = plan(cues, [segment('a', 750), segment('b', 900)], {
    policy: SHIPPED_VOICE_TIMING_POLICY,
    speed: 1.5,
  });
  assert.equal(value.speed, 1.5);
  const a = line(value, 'a');
  // The slot stays the caption's on the timeline; the rate and overrun are on the output clock.
  assert.equal(a.slot_ms, 1000);
  assert.equal(a.rate, (750 * 1.5) / 1000);
  assert.ok(Math.abs(a.speech_ms / a.rate - 1000 / 1.5) < 1e-9, 'it ends on the next caption');
  assert.equal(a.overrun_ms, 0);
  // Past the cap it is a long line, by how far it runs past its output slot.
  const b = line(value, 'b');
  assert.equal(b.rate, MAX_VOICE_SPEED);
  assert.equal(b.overrun_ms, Math.floor(900 / 1.2 - 1000 / 1.5));
  assert.deepEqual(value.conflicts, [b]);
  // The same line at 1x fits at its natural speed.
  const natural = plan(cues, [segment('a', 750), segment('b', 900)], {
    policy: SHIPPED_VOICE_TIMING_POLICY,
  });
  assert.equal(natural.speed, 1);
  assert.ok(natural.lines.every((entry) => entry.rate === 1 && entry.overrun_ms === 0));
});

test('at 0.5x the slot doubles, so a line long at 1x fits unsped', () => {
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000)];
  const segments = [segment('a', 1500), segment('b', 500)];
  const slow = plan(cues, segments, { policy: SHIPPED_VOICE_TIMING_POLICY, speed: 0.5 });
  assert.deepEqual(
    slow.lines.map((entry) => [entry.rate, entry.overrun_ms]),
    [
      [1, 0],
      [1, 0],
    ],
  );
  assert.deepEqual(slow.conflicts, []);
  const unity = plan(cues, segments, { policy: SHIPPED_VOICE_TIMING_POLICY });
  assert.equal(line(unity, 'a').overrun_ms, 250);
});

test('a duration-targeting engine keeps its rate and reports the overrun on the output clock', () => {
  const value = plan([cue('a', 0, 1000)], [segment('a', 1000)], {
    engine_targets_duration: true,
    speed: 2,
  });
  assert.equal(line(value, 'a').rate, 1);
  assert.equal(line(value, 'a').overrun_ms, 500);
});

test('refitting a plan to a new speed is the plan built at that speed', () => {
  const cues = [cue('a', 0, 1000), cue('b', 1000, 2000), cue('c', 2500, 3000)];
  const segments = [segment('a', 750), segment('b', 900), segment('c', 1300)];
  const options = { policy: SHIPPED_VOICE_TIMING_POLICY };
  const unity = plan(cues, segments, options);
  for (const speed of [0.5, 1.5, 2, 1]) {
    assert.deepEqual(
      refitVoiceTiming(unity, speed, SHIPPED_VOICE_TIMING_POLICY),
      plan(cues, segments, { ...options, speed }),
      `${speed}x`,
    );
  }
  assert.throws(
    () => refitVoiceTiming(unity, 0, SHIPPED_VOICE_TIMING_POLICY),
    /VOICE_TIMING_INVALID/,
  );
});
