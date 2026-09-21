import type { MessageKey } from '../../locales/message-key';

export function speechErrorKey(code: string): MessageKey {
  if (code === 'CANCELLED') return 'cancelled';
  if (code === 'SOURCE_CHANGED' || code === 'SOURCE_MISSING') return 'sourceChanged';
  if (code === 'NO_AUDIO') return 'speechNoAudio';
  if (code === 'SPEECH_COMPOSITION_UNAVAILABLE') return 'speechComposition';
  if (code === 'STALE_OPERATION') return 'rulesStale';
  if (code === 'MODEL_MISSING') return 'speechMissing';
  if (code === 'MODEL_RUNTIME_MISSING') return 'speechRuntimeMissing';
  if (
    ['SPEECH_MODEL_CHANGED', 'MODEL_CHANGED', 'MODEL_HASH_MISMATCH', 'MODEL_FILE_MISSING'].includes(
      code,
    )
  )
    return 'speechModelChanged';
  if (code === 'MODEL_LANGUAGE_UNAVAILABLE') return 'speechLanguageMissing';
  if (code === 'SPEECH_LIMIT' || code === 'SPEECH_RESULT_TOO_LARGE') return 'speechLimit';
  if (code === 'SPEECH_DISK_LOW') return 'speechDiskLow';
  if (code === 'INVALID_REQUEST' || code.includes('INVALID')) return 'speechInvalid';
  return 'speechFailed';
}
