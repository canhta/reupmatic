import type { Cue } from './cues.js';

export interface QcThresholds {
  maxCharsPerLine: number;
  minDurationMs: number;
  maxCps: number;
}

export const defaultQcThresholds: QcThresholds = {
  maxCharsPerLine: 42,
  minDurationMs: 700,
  maxCps: 20,
};

export type QcFlag = 'long-line' | 'too-short' | 'too-fast';

export function cueQcFlags(cue: Cue, thresholds: QcThresholds = defaultQcThresholds): QcFlag[] {
  const flags: QcFlag[] = [];
  const longestLine = Math.max(0, ...cue.text.split('\n').map((line) => line.length));
  if (longestLine > thresholds.maxCharsPerLine) flags.push('long-line');
  const durationMs = cue.end_ms - cue.start_ms;
  if (durationMs > 0 && durationMs < thresholds.minDurationMs) flags.push('too-short');
  if (durationMs > 0) {
    const cps = cue.text.replace(/\s/g, '').length / (durationMs / 1000);
    if (cps > thresholds.maxCps) flags.push('too-fast');
  }
  return flags;
}
