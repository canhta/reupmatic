import type { EditingRecipe } from './edit-recipe.js';

export type EditFade = NonNullable<EditingRecipe['fade']>;

/**
 * The Source monitor's live opacity/gain for a head/tail fade, on the output
 * clock. FFmpeg's `fade=t=in:st=0:d=<in>` ramps 0->1 over the output's first
 * `in` milliseconds and `fade=t=out:st=<duration-out>:d=<out>` ramps 1->0 over
 * its last `out`; the two never overlap (the recipe rejects that), so the
 * product is a single linear ramp at each end. This is the same shape the
 * worker's `fade`/`afade` filters emit, evaluated at one output time.
 */
export function fadePreviewOpacity(
  fade: EditFade,
  outputTimeMs: number,
  outputDurationMs: number,
): number {
  let opacity = 1;
  if (fade.in_ms > 0 && outputTimeMs < fade.in_ms) opacity = outputTimeMs / fade.in_ms;
  const outStart = outputDurationMs - fade.out_ms;
  if (fade.out_ms > 0 && outputTimeMs > outStart) {
    opacity = Math.min(opacity, (outputDurationMs - outputTimeMs) / fade.out_ms);
  }
  return Math.max(0, Math.min(1, opacity));
}
