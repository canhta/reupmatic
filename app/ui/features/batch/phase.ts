/** Locale key for a running job's phase; processing steps carry their own key. */
export function batchPhaseKey(phase: string): string {
  return phase.startsWith('processing') ? phase : `batchPhase_${phase}`;
}
