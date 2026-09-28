import type { Cue } from '../cues.js';
import {
  createTextLayers,
  getTextLayer,
  type TextLayerName,
  type TextSnapshot,
} from './document.js';

export type CueSyncState = 'linked' | 'deviated' | 'detached' | 'unlinked';

export interface CueSync {
  id: string;
  source_cue_id: string | null;
  state: CueSyncState;
}

/** The layer a derived (translated or copied) layer was produced from. */
export function translatedSourceLayer(snapshot: TextSnapshot): TextLayerName | null {
  const layers = snapshot.text_layers ?? createTextLayers();
  const origin = layers.translated.origin;
  if (origin.kind === 'translation' || origin.kind === 'copy') return origin.layer;
  return null;
}

function link(cue: Cue, sourceById: Map<string, Cue>): CueSync {
  if (!cue.source_cue_id) return { id: cue.id, source_cue_id: null, state: 'unlinked' };
  // A composition split gives every layer's piece the same derived id, so a marked piece pairs
  // with the source cue of that id; every other cue pairs with its recorded source cue.
  const source =
    (cue.split_from_cue_id ? sourceById.get(cue.id) : undefined) ??
    sourceById.get(cue.source_cue_id);
  if (!source) return { id: cue.id, source_cue_id: cue.source_cue_id, state: 'detached' };
  return {
    id: cue.id,
    source_cue_id: source.id,
    state: source.start_ms === cue.start_ms && source.end_ms === cue.end_ms ? 'linked' : 'deviated',
  };
}

/** Per translated cue: does its window still match the source cue it was made from? */
export function translatedCueSync(snapshot: TextSnapshot): CueSync[] {
  const translated = getTextLayer(snapshot, 'translated');
  const sourceName = translatedSourceLayer(snapshot);
  if (!sourceName) return [];
  const source = new Map(getTextLayer(snapshot, sourceName).cues.map((cue) => [cue.id, cue]));
  return translated.cues.map((cue) => link(cue, source));
}
