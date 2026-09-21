import type { MessageKey } from '../../../locales/message-key';

export function translationErrorKey(code: string): MessageKey {
  if (code === 'CANCELLED') return 'cancelled';
  if (code === 'MODEL_MISSING') return 'translationMissing';
  if (code === 'MODEL_RUNTIME_MISSING') return 'translationRuntimeMissing';
  if (
    [
      'MODEL_CHANGED',
      'MODEL_HASH_MISMATCH',
      'MODEL_FILE_MISSING',
      'TRANSLATION_MODEL_CHANGED',
    ].includes(code)
  )
    return 'translationModelChanged';
  if (code === 'MODEL_LANGUAGE_UNAVAILABLE') return 'translationPairMissing';
  if (code === 'TRANSLATION_LANGUAGE_MISMATCH') return 'translationLanguageMismatch';
  if (code === 'TRANSLATION_TARGET_LANGUAGE_MISMATCH') return 'translationTargetMismatch';
  if (code === 'TEXT_LAYER_CYCLE') return 'translationCycle';
  if (code === 'TRANSLATION_SOURCE_CHANGED' || code === 'TEXT_LAYER_STALE')
    return 'translationSourceChanged';
  if (code === 'TEXT_LAYER_EMPTY') return 'textLayerEmpty';
  if (code === 'STALE_OPERATION') return 'translationStaleHelp';
  if (code === 'TRANSLATION_TRUNCATED') return 'translationTruncated';
  if (code.includes('LIMIT') || code.includes('TOO_LARGE')) return 'translationLimit';
  if (code === 'TRANSLATION_DISK_LOW') return 'translationDiskLow';
  if (code === 'INVALID_REQUEST' || code.includes('INVALID')) return 'translationInvalid';
  return 'translationFailed';
}
