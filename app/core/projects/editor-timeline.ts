import { compositionDuration } from '../editing/composition/document.js';
import { resolveEditWindow } from '../editing/edit-recipe.js';
import { getTextLayer, textLayerNames } from '../subtitles/layers/document.js';
import type { EditorSnapshot } from './project.js';
export function validateProjectTimeline(snapshot: EditorSnapshot, sourceDuration: number): void {
  const duration = snapshot.composition
    ? compositionDuration(snapshot.composition)
    : sourceDuration;
  if (snapshot.sample.end_ms > duration) throw new Error('INVALID_PROJECT');
  resolveEditWindow(snapshot.processing?.editing, duration);
  if (
    snapshot.composition &&
    textLayerNames.some((name) =>
      getTextLayer(snapshot, name).cues.some((cue) => cue.end_ms > duration),
    )
  )
    throw new Error('INVALID_CUES');
}
