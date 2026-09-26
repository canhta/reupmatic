import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVisionInput, validateVisionResult } from '../../dist-core/vision/vision.js';

const request = {
  request_id: 'extract_0001',
  revision: 8,
  method: 'media.ocr.extract',
  params: {
    asset_id: 'source',
    start_ms: 0,
    end_ms: 121000,
    language: 'en',
    sample_ms: 2000,
    min_confidence: 0.5,
  },
};
const result = {
  kind: 'ocr',
  asset_id: 'source',
  source_sha256: 'a'.repeat(64),
  start_ms: 0,
  end_ms: 121000,
  width: 160,
  height: 90,
  analysis_id: 'analysis_0001',
  language: 'en',
  sample_ms: 2000,
  cues: [],
  observations: [],
  scope: 'full-source',
  evidence: { chunks: 2, preview_count: 0, observation_count: 61 },
};
test('full extraction is the only OCR request contract', () => {
  assert.deepEqual(parseVisionInput(request), request);
  assert.throws(() => parseVisionInput({ ...request, method: 'media.ocr' }), /INVALID_REQUEST/);
  assert.throws(
    () => parseVisionInput({ ...request, params: { ...request.params, start_ms: 1 } }),
    /INVALID_REQUEST/,
  );
  assert.throws(
    () => parseVisionInput({ ...request, params: { ...request.params, output: '/arbitrary' } }),
    /INVALID_REQUEST/,
  );
});
test('full extraction validates evidence summary without implying that the UI shows every frame', () => {
  assert.deepEqual(validateVisionResult(result, request), result);
  for (const patch of [
    { scope: 'sample' },
    { evidence: undefined },
    { evidence: { chunks: 2, preview_count: 1, observation_count: 61 } },
    { evidence: { chunks: 0, preview_count: 0, observation_count: 61 } },
  ]) {
    assert.throws(
      () => validateVisionResult({ ...result, ...patch }, request),
      /INVALID_WORKER_RESPONSE/,
    );
  }
});
