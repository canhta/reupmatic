import { realpath, stat } from 'node:fs/promises';
import type { PublicationMedia } from '../../../core/distribution/publishing/contracts.js';
import { parseFrameRate } from '../../../core/media/frame-rate.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';

export type ProbedVideoFile = PublicationMedia;

/** Probes a path directly, without registering it: preflight must not grow the asset registry. */
export async function probeVideoFile(
  worker: WorkerClient,
  filename: string,
): Promise<ProbedVideoFile> {
  const canonical = await realpath(filename);
  const info = await worker.request('media.probe-file', { path: canonical }).result;
  if (
    !Number.isInteger(info.duration_ms) ||
    Number(info.duration_ms) <= 0 ||
    !Number.isInteger(info.width) ||
    Number(info.width) <= 0 ||
    !Number.isInteger(info.height) ||
    Number(info.height) <= 0 ||
    typeof info.frame_rate !== 'string'
  )
    throw new Error('INVALID_WORKER_RESPONSE');
  const facts = await stat(canonical);
  return {
    duration_ms: Number(info.duration_ms),
    width: Number(info.width),
    height: Number(info.height),
    size_bytes: facts.size,
    fps: parseFrameRate(info.frame_rate),
  };
}
