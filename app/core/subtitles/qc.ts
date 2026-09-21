import type { Cue } from './cues.js';

/**
 * Default quality-check thresholds for the cue list's row tint. Configuring these per-project
 * is future Settings work; this module only owns the check itself, not where the numbers come
 * from.
 */
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

/** Cheap, local checks only — no model call, no network. Runs on every render. */
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
