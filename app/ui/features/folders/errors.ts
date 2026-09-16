import { processingErrorKey } from '../processing/i18n';
import { visionErrorKey } from '../vision/i18n';
const errorKeys: Record<string, string> = {
  AUTOMATION_UNAVAILABLE: 'folderUnavailable',
  WATCH_COMPONENT_MISSING: 'folderComponentMissing',
  WATCH_OUTPUT_LOOP: 'folderLoopError',
  WATCH_EXISTS: 'folderExists',
  WATCH_SCAN_LIMIT: 'folderLimit',
  WATCH_LIMIT: 'folderLimit',
  WATCH_FOLDER_MISSING: 'folderMissing',
  WATCH_FOLDER_CHANGED: 'folderMissing',
  ENOENT: 'folderMissing',
  QUEUE_FULL: 'batchQueueFull',
};

export function folderErrorKey(code: string): string {
  if (processingErrorKey(code)) return processingErrorKey(code)!;
  if (code.startsWith('MODEL_') || code.startsWith('VISION_')) return visionErrorKey(code);
  return errorKeys[code] ?? 'folderError';
}
