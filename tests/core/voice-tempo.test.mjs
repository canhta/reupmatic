import assert from 'node:assert/strict';
import test from 'node:test';
import { stretchTempo } from '../../dist-core/editing/voice-tempo.js';

const sampleRate = 24000;
const tone = (hz, seconds) =>
  Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, index) =>
    Math.sin((2 * Math.PI * hz * index) / sampleRate),
  );
// Rising zero crossings over the steady middle, to read the pitch the listener hears.
function pitch(samples) {
  const from = Math.floor(samples.length * 0.2),
    to = Math.floor(samples.length * 0.8);
  let crossings = 0;
  for (let index = from + 1; index < to; index += 1)
    if (samples[index - 1] < 0 && samples[index] >= 0) crossings += 1;
  return (crossings * sampleRate) / (to - from);
}

test('a line sped up plays for its source length divided by the speed', () => {
  for (const rate of [1.05, 1.12, 1.2]) {
    const source = tone(440, 1.2);
    const out = stretchTempo(source, sampleRate, rate);
    assert.equal(out.length, Math.round(source.length / rate), `${rate}`);
  }
});

test('the speed-up keeps the voice at its own pitch, as atempo does', () => {
  for (const hz of [180, 440]) {
    const out = stretchTempo(tone(hz, 1.2), sampleRate, 1.2);
    assert.ok(Math.abs(pitch(out) - hz) < hz * 0.03, `${hz} Hz read as ${pitch(out)}`);
  }
});

test('the stretched line keeps its level, without gaps or doubled overlaps', () => {
  const out = stretchTempo(tone(220, 1), sampleRate, 1.15);
  const window = Math.round(sampleRate * 0.02);
  for (let start = window; start + window < out.length - window; start += window) {
    let energy = 0;
    for (let index = start; index < start + window; index += 1) energy += out[index] ** 2;
    const rms = Math.sqrt(energy / window);
    assert.ok(rms > 0.6 && rms < 0.8, `rms ${rms} at ${start}`);
  }
});

test('natural speed is an exact copy and an empty or tiny line survives', () => {
  const source = tone(300, 0.5);
  assert.deepEqual(stretchTempo(source, sampleRate, 1), source);
  assert.notEqual(stretchTempo(source, sampleRate, 1), source);
  assert.equal(stretchTempo(new Float32Array(0), sampleRate, 1.2).length, 0);
  assert.equal(stretchTempo(new Float32Array(12), sampleRate, 1.2).length, 10);
});

test('any playback speed, slower or faster, keeps the pitch and the length', () => {
  for (const rate of [0.25, 0.5, 0.75, 1.5, 2, 4]) {
    const source = tone(440, 1.2);
    const out = stretchTempo(source, sampleRate, rate);
    assert.equal(out.length, Math.round(source.length / rate), `${rate}`);
    assert.ok(Math.abs(pitch(out) - 440) < 440 * 0.03, `${rate}x read as ${pitch(out)}`);
  }
});

test('a non-positive speed or a malformed input is refused', () => {
  for (const [rate, rateHz] of [
    [0, sampleRate],
    [-1, sampleRate],
    [Number.POSITIVE_INFINITY, sampleRate],
    [Number.NaN, sampleRate],
    [1.2, 0],
  ])
    assert.throws(() => stretchTempo(tone(300, 0.1), rateHz, rate), /VOICE_TEMPO_INVALID/);
});
