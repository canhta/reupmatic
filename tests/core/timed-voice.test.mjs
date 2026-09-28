import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeWav,
  renderTimedVoice,
  timedVoiceLines,
} from '../../dist-core/speech/synthesis/timed-voice.js';
import {
  planVoiceTiming,
  SHIPPED_VOICE_TIMING_POLICY,
} from '../../dist-core/speech/synthesis/timing.js';

const sampleRate = 24000;
const cue = (id, start_ms, end_ms) => ({ id, start_ms, end_ms, text: id });
const frames = (ms) => Math.round((ms * sampleRate) / 1000);
// Two lines back to back in the recording: `a` fits its slot, `b` is 1.2x too long for its own.
const cues = [cue('a', 2000, 3000), cue('b', 3000, 4000)];
const segments = [
  { cue_id: 'a', start_frame: 0, end_frame: frames(800), lead_silence_frames: 0 },
  { cue_id: 'b', start_frame: frames(800), end_frame: frames(2000), lead_silence_frames: 0 },
];
const plan = planVoiceTiming({
  cues,
  segments,
  sample_rate: sampleRate,
  engine_targets_duration: false,
  speed: 1,
  policy: SHIPPED_VOICE_TIMING_POLICY,
});
const tone = (hz, count) =>
  Float32Array.from({ length: count }, (_, index) =>
    Math.sin((2 * Math.PI * hz * index) / sampleRate),
  );
function pitch(samples) {
  let crossings = 0;
  for (let index = 1; index < samples.length; index += 1)
    if (samples[index - 1] < 0 && samples[index] >= 0) crossings += 1;
  return (crossings * sampleRate) / samples.length;
}

test('a reviewed line plays its recorded span at its planned speed, on its cue', () => {
  assert.deepEqual(timedVoiceLines(plan, segments, sampleRate), [
    { cue_id: 'a', start_frame: 0, end_frame: frames(800), rate: 1, at_frame: 0 },
    // Placed from the first line on, so the review starts with speech, not the silence before it.
    {
      cue_id: 'b',
      start_frame: frames(800),
      end_frame: frames(2000),
      rate: 1.2,
      at_frame: frames(1000),
    },
  ]);
});

test('at 1.5x a reviewed line starts on its caption in the sped file, fitted to its slot', () => {
  const sped = planVoiceTiming({
    cues,
    segments,
    sample_rate: sampleRate,
    engine_targets_duration: false,
    speed: 1.5,
    policy: SHIPPED_VOICE_TIMING_POLICY,
  });
  const [a, b] = timedVoiceLines(sped, segments, sampleRate);
  assert.equal(a.at_frame, 0);
  assert.equal(b.at_frame, frames(1000 / 1.5));
  // `a` (800 ms) is sped into its 667 ms output slot and ends as `b` begins.
  assert.equal(a.rate, (800 * 1.5) / 1000);
  assert.ok(Math.abs((a.end_frame - a.start_frame) / a.rate - b.at_frame) <= 1);
});

test('a plan and recording that disagree are refused, not guessed at', () => {
  assert.throws(
    () => timedVoiceLines(plan, segments.slice(0, 1), sampleRate),
    /VOICE_TIMING_INVALID/,
  );
});

test('the review plays the timed voice: a sped line fills its slot at its own pitch', () => {
  const recording = new Float32Array(frames(2000));
  recording.set(tone(300, frames(800)), 0);
  recording.set(tone(200, frames(1200)), frames(800));
  const [out] = renderTimedVoice([recording], sampleRate, plan, segments);
  assert.equal(out.length, frames(1000) + Math.round(frames(1200) / 1.2));
  // The natural line is the recording itself, sample for sample.
  assert.deepEqual(out.subarray(0, frames(800)), recording.subarray(0, frames(800)));
  // The gap to the next cue is silent.
  assert.ok(out.subarray(frames(800), frames(1000)).every((value) => value === 0));
  const sped = out.subarray(frames(1100), out.length - frames(100));
  assert.ok(Math.abs(pitch(sped) - 200) < 200 * 0.03, `read as ${pitch(sped)} Hz`);
});

test('the timed voice is served as 16-bit PCM WAV the player can load', () => {
  const wav = new DataView(encodeWav([Float32Array.of(0, 1, -1, 2)], 24000));
  const text = (at) => String.fromCharCode(...new Uint8Array(wav.buffer, wav.byteOffset + at, 4));
  assert.equal(text(0), 'RIFF');
  assert.equal(text(8), 'WAVE');
  assert.equal(wav.getUint32(4, true), wav.byteLength - 8);
  assert.equal(wav.getUint16(22, true), 1);
  assert.equal(wav.getUint32(24, true), 24000);
  assert.equal(wav.getUint16(34, true), 16);
  assert.equal(text(36), 'data');
  assert.equal(wav.getUint32(40, true), 8);
  assert.deepEqual(
    [0, 1, 2, 3].map((index) => wav.getInt16(44 + index * 2, true)),
    [0, 32767, -32767, 32767],
  );
});
