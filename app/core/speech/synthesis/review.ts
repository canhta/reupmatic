import {
  getTextLayer,
  plainCues,
  sameText,
  type TextSnapshot,
} from '../../subtitles/layers/document.js';
import { parseSynthesisInput, type SynthesisInput, type SynthesisLanguage } from './contracts.js';

export interface SynthesisOptions {
  request_id: string;
  revision: number;
  language: SynthesisLanguage;
  model_id: string;
  voice_id: string;
  cue_ids?: string[];
}

/** A voice request is an immutable selection from spoken text, never a document edit. */
export function prepareSynthesis(
  snapshot: TextSnapshot,
  options: SynthesisOptions,
): SynthesisInput {
  const layer = getTextLayer(snapshot, 'spoken');
  if (layer.stale) throw new Error('TEXT_LAYER_STALE');
  if (!layer.cues.length) throw new Error('TEXT_LAYER_EMPTY');
  if (layer.language !== null && layer.language !== options.language)
    throw new Error('SYNTHESIS_LANGUAGE_MISMATCH');
  const ids = options.cue_ids;
  if (
    ids &&
    (!Array.isArray(ids) ||
      !ids.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !layer.cues.some((cue) => cue.id === id)))
  )
    throw new Error('INVALID_REQUEST');
  const cues = ids ? layer.cues.filter((cue) => ids.includes(cue.id)) : layer.cues;
  return parseSynthesisInput({
    request_id: options.request_id,
    revision: options.revision,
    params: {
      source_layer: 'spoken',
      source_token: layer.token,
      language: options.language,
      model_id: options.model_id,
      voice_id: options.voice_id,
      cues: plainCues(cues),
    },
  });
}

export function assertSynthesisCurrent(snapshot: TextSnapshot, value: SynthesisInput): void {
  const input = parseSynthesisInput(value),
    layer = getTextLayer(snapshot, 'spoken');
  const ids = new Set(input.params.cues.map((cue) => cue.id));
  if (
    layer.stale ||
    layer.token !== input.params.source_token ||
    (layer.language !== null && layer.language !== input.params.language) ||
    !sameText(
      layer.cues.filter((cue) => ids.has(cue.id)),
      input.params.cues,
    )
  )
    throw new Error('STALE_OPERATION');
}
