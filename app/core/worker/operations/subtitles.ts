import { assertCues, type Cue } from '../../subtitles/cues.js';
import type { OperationEntry } from '../operation-contract.js';
import { resultObject, resultString } from '../result-validation.js';
import { type AssetRegisterResult, validateAssetRegisterResult } from './assets.js';

export interface SubtitleLoadResult extends Record<string, unknown> {
  cues: Cue[];
}

function validateSubtitleLoadResult(data: unknown): SubtitleLoadResult {
  const value = resultObject(data);
  assertCues(value.cues);
  return value as SubtitleLoadResult;
}

/** Shared by `subtitles.save` and `subtitles.prepare`. */
export interface SubtitleAssetResult extends AssetRegisterResult {
  path: string;
  ass_text: string;
}

function validateSubtitleAssetResult(data: unknown): SubtitleAssetResult {
  const value = validateAssetRegisterResult(data);
  resultString(value, 'path');
  resultString(value, 'ass_text');
  return value as SubtitleAssetResult;
}

export interface SubtitlePreviewResult extends Record<string, unknown> {
  ass_text: string;
}

function validateSubtitlePreviewResult(data: unknown): SubtitlePreviewResult {
  const value = resultObject(data);
  resultString(value, 'ass_text');
  return value as SubtitlePreviewResult;
}

export const subtitleOperations = {
  'subtitles.load': {
    method: 'subtitles.load',
    kind: 'queued',
    validate: validateSubtitleLoadResult,
  },
  'subtitles.save': {
    method: 'subtitles.save',
    kind: 'queued',
    validate: validateSubtitleAssetResult,
  },
  'subtitles.preview': {
    method: 'subtitles.preview',
    kind: 'queued',
    validate: validateSubtitlePreviewResult,
  },
  'subtitles.prepare': {
    method: 'subtitles.prepare',
    kind: 'queued',
    validate: validateSubtitleAssetResult,
  },
} as const satisfies Record<string, OperationEntry<unknown>>;
