import { processingErrorKey } from '../processing/message-key';
import { visionErrorKey } from '../vision/error-message';

const errorKeys: Record<string, string> = {
  SOURCE_CHANGED: 'sourceChanged',
  SOURCE_MISSING: 'sourceChanged',
  OUTPUT_CONFLICT: 'batchOutputConflict',
  QUEUE_UNAVAILABLE: 'batchUnavailable',
  QUEUE_VERSION: 'batchUnavailable',
  INTERRUPTED: 'batchInterrupted',
  OUTPUT_COMMIT_UNSUPPORTED: 'batchUnsupportedFolder',
  OUTPUT_MISSING: 'batchOutputMissing',
  QUEUE_FULL: 'batchQueueFull',
  SELECTION_LIMIT: 'batchSelectionLimit',
  CANCELLED: 'cancelled',
};

export function batchErrorKey(code: string): string {
  if (code.startsWith('OUTPUT_DIRECTORY')) return 'batchFolderMissing';
  if (code.startsWith('WORKER_')) return 'workerError';
  const processing = processingErrorKey(code);
  if (processing) return processing;
  if (code.startsWith('MODEL_') || code.startsWith('VISION_')) return visionErrorKey(code);
  return errorKeys[code] ?? 'failed';
}
