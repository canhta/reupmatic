// Shared with worker/media/audio/mixing.py: one ducking definition for the live
// program monitor and the FFmpeg sidechain chain. Pure numbers, no DOM.

export const DUCK_RATIO = 8;
export const DUCK_ATTACK_MS = 20;
export const DUCK_REFERENCE_DBFS = -18;
export const DUCK_THRESHOLD_MIN = 0.000976563;

/** Threshold in dBFS such that a -18 dBFS key loses exactly `amountDb` at ratio 8. */
export function duckThresholdDb(amountDb: number): number {
  return DUCK_REFERENCE_DBFS - amountDb / (1 - 1 / DUCK_RATIO);
}

export function duckThreshold(amountDb: number): number {
  const threshold = 10 ** (duckThresholdDb(amountDb) / 20);
  return Math.min(1, Math.max(DUCK_THRESHOLD_MIN, threshold));
}

/** Static compressor gain reduction in dB for a key level in dBFS. */
export function duckGainReductionDb(levelDb: number, amountDb: number): number {
  const thresholdDb = duckThresholdDb(amountDb);
  if (!Number.isFinite(levelDb) || levelDb <= thresholdDb) return 0;
  return (levelDb - thresholdDb) * (1 - 1 / DUCK_RATIO);
}

/** Linear gain the music keeps while the key plays, from a key level in dBFS. */
export function duckMusicGain(levelDb: number, amountDb: number): number {
  return 10 ** (-duckGainReductionDb(levelDb, amountDb) / 20);
}

/** One-pole attack/release coefficients for an envelope follower at `sampleRate`. */
export function envelopeCoefficients(
  sampleRate: number,
  attackMs = DUCK_ATTACK_MS,
  releaseMs: number,
): { attack: number; release: number } {
  const time = (ms: number) => Math.exp(-1 / Math.max(1, (ms / 1000) * sampleRate));
  return { attack: time(attackMs), release: time(releaseMs) };
}
