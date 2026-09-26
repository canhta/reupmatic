import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DUCK_ATTACK_MS,
  DUCK_RATIO,
  DUCK_THRESHOLD_MIN,
  duckGainReductionDb,
  duckMusicGain,
  duckThreshold,
  duckThresholdDb,
  envelopeCoefficients,
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
