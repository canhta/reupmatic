import type { MessageKey } from '../../locales/message-key';

export function visionErrorKey(code: string): MessageKey {
  if (code === 'MODEL_MISSING') return 'visionModelMissing';
  if (code === 'MODEL_RUNTIME_MISSING') return 'visionRuntimeMissing';
  if (code === 'RUNTIME_PACK_MISSING') return 'settingsModelRuntimePackMissing';
  if (code === 'MODEL_MANIFEST_INVALID') return 'visionManifestInvalid';
  if (code === 'MODEL_HASH_MISMATCH') return 'visionHashMismatch';
  if (code === 'MODEL_LANGUAGE_UNAVAILABLE') return 'visionLanguageMissing';
  if (code === 'MODEL_NETWORK_DISABLED') return 'visionNetworkBlocked';
  if (code === 'VISION_LIMIT' || code === 'VISION_RESULT_TOO_LARGE') return 'visionLimit';
  if (code === 'VISION_DISK_LOW') return 'visionDiskLow';
  if (code === 'VISION_FORMAT_UNSUPPORTED') return 'visionFormat';
  if (code === 'INVALID_REQUEST') return 'visionInvalid';
  if (code === 'CANCELLED') return 'visionCancelled';
  return 'visionModelFailed';
}
