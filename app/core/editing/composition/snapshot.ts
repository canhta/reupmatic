import { validateProjectTimeline } from '../../projects/editor-timeline.js';
import type { EditorSnapshot } from '../../projects/project.js';
import { assertCues, type Cue } from '../../subtitles/cues.js';
import {
  getTextLayer,
  parseTextLayers,
  sameText,
  textLayerNames,
} from '../../subtitles/layers/document.js';
import { type CompositionCommand, editComposition } from './commands.js';
import { type Composition, compositionDuration, parseComposition } from './document.js';

/** Apply one explicit composition operation as one recoverable history entry. */
export function compositionSnapshot(
  snapshot: EditorSnapshot,
  value: Composition,
  cues: Cue[],
): EditorSnapshot {
  assertCues(cues);
  for (const range of [snapshot.sample, snapshot.processing?.editing?.trim].filter(Boolean)) {
    if (
      !range ||
      !Number.isInteger(range.start_ms) ||
      !Number.isInteger(range.end_ms) ||
      range.start_ms < 0 ||
      range.end_ms <= range.start_ms
    )
      throw new Error('INVALID_PROJECT');
  }
  const composition = parseComposition(value),
    duration = compositionDuration(composition);
  const next = structuredClone({ ...snapshot, composition, cues });
  const clamp = (range: { start_ms: number; end_ms: number }) => ({
    start_ms: Math.max(0, Math.min(range.start_ms, duration - 1)),
    end_ms: Math.max(1, Math.min(range.end_ms, duration)),
  });
  next.sample = clamp(next.sample);
  if (next.processing?.editing?.trim)
    next.processing.editing.trim = clamp(next.processing.editing.trim);
  validateProjectTimeline(next, duration);
  return next;
}

/** Apply the same cut mapping to every text layer, retaining independently edited words. */
export function editCompositionSnapshot(
  snapshot: EditorSnapshot,
  commands: CompositionCommand[],
): EditorSnapshot {
  if (!snapshot.composition) throw new Error('INVALID_COMPOSITION');
  let composition = snapshot.composition;
  let next = structuredClone(snapshot);
  for (const command of commands) {
    const before = next;
    const edited = editComposition(composition, before.cues, command);
    let layers = before.text_layers ? structuredClone(before.text_layers) : undefined;
    if (layers) {
      for (const name of textLayerNames) {
        const old = getTextLayer(before, name);
        const cues =
          name === 'displayed' ? edited.cues : editComposition(composition, old.cues, command).cues;
        if (!sameText(old.cues, cues)) layers[name].token = crypto.randomUUID();
        if (name !== 'displayed') layers[name].cues = cues;
      }
      for (const name of textLayerNames) {
        const origin = layers[name].origin;
        if (
          (origin.kind === 'copy' || origin.kind === 'translation') &&
          origin.token === before.text_layers?.[origin.layer].token
        ) {
          origin.token = layers[origin.layer].token;
        }
      }
      layers = parseTextLayers(layers);
    }
    next = compositionSnapshot(
      { ...before, ...(layers ? { text_layers: layers } : {}) },
      edited.composition,
      edited.cues,
    );
    composition = edited.composition;
  }
  return next;
}
