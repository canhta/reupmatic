import { editTextLayer } from '../../subtitles/layers/commands.js';
import { getTextLayer, plainCues, sameText, type LayerOrigin, type TextLayerName, type TextSnapshot } from '../../subtitles/layers/document.js';
import type { Cue } from '../../subtitles/cues.js';
import { parseTranslationInput, validateTranslationResult, type TranslationInput, type TranslationResult } from './contracts.js';
import type { TranslationLanguage, TranslationPolicy, TranslationRule, TranslationSource } from './rules.js';

export interface TranslationOptions {
  request_id: string; revision: number; source_layer: TranslationSource;
  source_language: TranslationLanguage; target_language: TranslationLanguage;
  model_id: string; rules: TranslationRule[];
}
export interface TranslationPreview {
  input: TranslationInput; result: TranslationResult; target_token: string;
  policy: TranslationPolicy; before: Cue[]; cues: Cue[]; kept: number; added: number; replaced: number; removed: number;
}

function validateSource(snapshot: TextSnapshot, name: TranslationSource, language: TranslationLanguage) {
  const layer = getTextLayer(snapshot, name);
  if (layer.stale) throw new Error('TEXT_LAYER_STALE');
  if (!layer.cues.length) throw new Error('TEXT_LAYER_EMPTY');
  if (layer.language !== null && layer.language !== language) throw new Error('TRANSLATION_LANGUAGE_MISMATCH');
  const visited = new Set<TextLayerName>(['translated']);
  let current: TextLayerName = name;
  while (true) {
    if (visited.has(current)) throw new Error('TEXT_LAYER_CYCLE');
    visited.add(current);
    const origin: LayerOrigin = getTextLayer(snapshot, current).origin;
    if (origin.kind !== 'copy' && origin.kind !== 'translation') break;
    current = origin.layer;
  }
  return layer;
}

export function prepareTranslation(snapshot: TextSnapshot, options: TranslationOptions): TranslationInput {
  const source = validateSource(snapshot, options.source_layer, options.source_language);
  return parseTranslationInput({ request_id: options.request_id, revision: options.revision, params: {
    source_layer: options.source_layer, source_token: source.token, source_language: options.source_language,
    target_language: options.target_language, model_id: options.model_id, rules: options.rules, cues: plainCues(source.cues),
  } });
}

/** Review may refresh the target snapshot; a changed source must be translated again. */
export function previewTranslation(snapshot: TextSnapshot, value: TranslationInput, response: TranslationResult,
  policy: TranslationPolicy = 'keep-existing'): TranslationPreview {
  const input = parseTranslationInput(value), result = validateTranslationResult(response, input), p = input.params;
  if (!['keep-existing', 'replace-all'].includes(policy)) throw new Error('INVALID_REQUEST');
  const source = validateSource(snapshot, p.source_layer, p.source_language);
  if (source.token !== p.source_token || !sameText(source.cues, p.cues)) throw new Error('STALE_OPERATION');
  const target = getTextLayer(snapshot, 'translated'), keep = policy === 'keep-existing';
  if (keep && target.cues.length && target.language !== p.target_language) throw new Error('TRANSLATION_TARGET_LANGUAGE_MISMATCH');
  const existing = new Set(target.cues.map(cue => cue.id)), incoming = new Set(result.cues.map(cue => cue.id));
  const additions = result.cues.filter(cue => !existing.has(cue.id));
  const cues = keep ? [...target.cues, ...additions].sort((a, b) => a.start_ms - b.start_ms) : result.cues;
  return structuredClone({ input, result, target_token: target.token, policy, before: target.cues, cues,
    kept: keep ? target.cues.length : 0, added: additions.length,
    replaced: keep ? 0 : result.cues.length - additions.length,
    removed: keep ? 0 : target.cues.filter(cue => !incoming.has(cue.id)).length });
}

export function applyTranslation<T extends TextSnapshot>(snapshot: T, preview: TranslationPreview): T {
  let expected: TranslationPreview;
  try { expected = previewTranslation(snapshot, preview.input, preview.result, preview.policy); }
  catch { throw new Error('STALE_OPERATION'); }
  if (JSON.stringify(expected) !== JSON.stringify(preview)) throw new Error('STALE_OPERATION');
  const p = preview.input.params;
  const next = editTextLayer(snapshot, 'translated', preview.cues, { language: p.target_language, origin: {
    kind: 'translation', layer: p.source_layer, token: p.source_token, request_id: preview.input.request_id,
    source_language: p.source_language, target_language: p.target_language,
    model_id: p.model_id, runtime: preview.result.runtime, rules: p.rules, policy: preview.policy,
  } });
  if (preview.kept) next.text_layers!.translated.edited = true;
  return next;
}
