import type { MediaDownloadResult } from '../../media/media-contracts.js';
import type { RenderOutput } from '../../rendering/render-coordinator.js';
import type { OperationEntry } from '../operation-contract.js';
import { RemoteError } from '../remote-error.js';
import {
  resultBoolean,
  resultNumber,
  resultObject,
  resultRecord,
  resultString,
} from '../result-validation.js';

export interface MediaProbeResult extends Record<string, unknown> {
  duration_ms: number;
  width: number;
  height: number;
  /** A ratio string (e.g. "30" or "30000/1001"), not a decimal number. */
  frame_rate: string;
  has_audio: boolean;
}

function validateMediaProbeResult(data: unknown): MediaProbeResult {
  const value = resultObject(data);
  resultNumber(value, 'duration_ms');
  resultNumber(value, 'width');
  resultNumber(value, 'height');
  resultString(value, 'frame_rate');
  resultBoolean(value, 'has_audio');
  return value as MediaProbeResult;
}

function validateMediaDownloadResult(data: unknown): MediaDownloadResult {
  const value = resultObject(data);
  resultString(value, 'path');
  resultNumber(value, 'bytes');
  resultString(value, 'sha256');
  resultString(value, 'container');
  resultString(value, 'codec');
  resultNumber(value, 'duration_ms');
  resultNumber(value, 'width');
  resultNumber(value, 'height');
  resultString(value, 'frame_rate');
  resultBoolean(value, 'has_audio');
  resultBoolean(value, 'reused');
  resultBoolean(value, 'resumed');
  return value as MediaDownloadResult;
}

export interface MediaPeaksResult extends Record<string, unknown> {
  peaks: number[];
  duration_ms: number;
}

function validateMediaPeaksResult(data: unknown): MediaPeaksResult {
  const value = resultObject(data);
  if (!Array.isArray(value.peaks) || value.peaks.some((peak) => typeof peak !== 'number')) {
    throw new RemoteError('INVALID_WORKER_RESPONSE');
  }
  resultNumber(value, 'duration_ms');
  return value as MediaPeaksResult;
}

export interface AudioProbeResult extends Record<string, unknown> {
  duration_ms: number;
}

function validateAudioProbeResult(data: unknown): AudioProbeResult {
  const value = resultObject(data);
  resultNumber(value, 'duration_ms');
  return value as AudioProbeResult;
}

function validateRenderOutput(data: unknown): RenderOutput {
  const value = resultObject(data);
  resultString(value, 'artifact_id');
  resultString(value, 'path');
  resultNumber(value, 'duration_ms');
  resultBoolean(value, 'cache_hit');
  return value as unknown as RenderOutput;
}

export interface MediaPosterResult {
  cover_path: string;
  width: number;
  height: number;
}

function validateMediaPosterResult(data: unknown): MediaPosterResult {
  const value = resultObject(data);
  resultString(value, 'cover_path');
  resultNumber(value, 'width');
  resultNumber(value, 'height');
  return value as unknown as MediaPosterResult;
}

export const mediaOperations = {
  'media.probe': { method: 'media.probe', kind: 'queued', validate: validateMediaProbeResult },
  'media.probe-file': {
    method: 'media.probe-file',
    kind: 'queued',
    validate: validateMediaProbeResult,
  },
  'media.download': {
    method: 'media.download',
    kind: 'queued',
    validate: validateMediaDownloadResult,
  },
  'media.peaks': { method: 'media.peaks', kind: 'queued', validate: validateMediaPeaksResult },
  'media.poster': { method: 'media.poster', kind: 'queued', validate: validateMediaPosterResult },
  'audio.probe': { method: 'audio.probe', kind: 'queued', validate: validateAudioProbeResult },
  'media.ocr.extract': { method: 'media.ocr.extract', kind: 'queued', validate: resultRecord },
  'media.inpaint': { method: 'media.inpaint', kind: 'queued', validate: resultRecord },
  'media.render': { method: 'media.render', kind: 'queued', validate: validateRenderOutput },
  'media.process': { method: 'media.process', kind: 'queued', validate: validateRenderOutput },
} as const satisfies Record<string, OperationEntry<unknown>>;
