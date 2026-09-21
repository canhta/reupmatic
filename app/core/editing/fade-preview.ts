import type { EditingRecipe } from './edit-recipe.js';

export type EditFade = NonNullable<EditingRecipe['fade']>;

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
