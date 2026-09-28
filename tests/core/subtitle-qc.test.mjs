import assert from 'node:assert/strict';
import test from 'node:test';
import { cueQcFlags, defaultQcThresholds } from '../../dist-core/subtitles/qc.js';

test('a cue within every threshold has no QC flags', () => {
  const cue = { id: 'a', start_ms: 0, end_ms: 2000, text: 'Short line' };
  assert.deepEqual(cueQcFlags(cue), []);
});

test('a line longer than the max chars/line threshold is flagged', () => {
  const cue = { id: 'a', start_ms: 0, end_ms: 5000, text: 'x'.repeat(60) };
  assert.deepEqual(cueQcFlags(cue), ['long-line']);
});

test('the longest of several lines decides the long-line flag', () => {
  const short = { id: 'a', start_ms: 0, end_ms: 5000, text: 'short\nshort' };
  const long = { id: 'b', start_ms: 0, end_ms: 5000, text: `short\n${'y'.repeat(50)}` };
  assert.deepEqual(cueQcFlags(short), []);
  assert.deepEqual(cueQcFlags(long), ['long-line']);
});

test('a cue shorter than the minimum duration is flagged', () => {
  const cue = { id: 'a', start_ms: 0, end_ms: 300, text: 'Hi' };
  assert.deepEqual(cueQcFlags(cue), ['too-short']);
});

test('a cue above the max characters-per-second rate is flagged', () => {
  // 40 characters in 800 ms = 50 chars/s, far past the default 20 chars/s cap,
  // while 800 ms itself clears the default 700 ms minimum duration.
  const cue = { id: 'a', start_ms: 0, end_ms: 800, text: 'x'.repeat(40) };
  const flags = cueQcFlags(cue);
  assert.deepEqual(flags, ['too-fast']);
});

test('flags combine when a cue trips more than one threshold', () => {
  const cue = { id: 'a', start_ms: 0, end_ms: 200, text: 'x'.repeat(60) };
  const flags = cueQcFlags(cue);
  assert.ok(flags.includes('long-line'));
  assert.ok(flags.includes('too-short'));
  assert.ok(flags.includes('too-fast'));
});

test('custom thresholds are honoured', () => {
  const cue = { id: 'a', start_ms: 0, end_ms: 5000, text: 'twelve chars' };
  assert.deepEqual(cueQcFlags(cue, { ...defaultQcThresholds, maxCharsPerLine: 5 }), ['long-line']);
});
