import type { MessageKey } from '../../locales/message-key';

const errors: Record<string, MessageKey> = {
  CANCELLED: 'cancelled',
  SOURCE_CHANGED: 'sourceChanged',
  SOURCE_MISSING: 'sourceChanged',
  NO_AUDIO: 'speechNoAudio',
  SPEECH_COMPOSITION_UNAVAILABLE: 'speechComposition',
  STALE_OPERATION: 'rulesStale',
  MODEL_MISSING: 'speechMissing',
  MODEL_RUNTIME_MISSING: 'speechRuntimeMissing',
  SPEECH_PROTOCOL_UNKNOWN: 'speechRuntimeMissing',
  SPEECH_MODEL_CHANGED: 'speechModelChanged',
  MODEL_CHANGED: 'speechModelChanged',
  MODEL_HASH_MISMATCH: 'speechModelChanged',
  MODEL_FILE_MISSING: 'speechModelChanged',
  SPEECH_MANIFEST_INVALID: 'speechModelChanged',
  MODEL_LANGUAGE_UNAVAILABLE: 'speechLanguageMissing',
  SPEECH_LIMIT: 'speechLimit',
  SPEECH_RESULT_TOO_LARGE: 'speechLimit',
  SPEECH_CLOUD_LIMIT: 'speechCloudLimit',
  SPEECH_DISK_LOW: 'speechDiskLow',
  MODEL_NETWORK_DISABLED: 'speechOffline',
  MODEL_INFERENCE_FAILED: 'speechInferenceFailed',
  MODEL_OUTPUT_INVALID: 'speechOutputInvalid',
  SPEECH_TIMING_INVALID: 'speechOutputInvalid',
  SPEECH_AUDIO_INVALID: 'speechAudioFailed',
  TOOL_FAILED: 'speechAudioFailed',
  TOOL_TIMEOUT: 'speechAudioFailed',
  QUEUE_FULL: 'speechBusy',
  SESSION_LIMIT: 'speechBusy',
  EDITOR_BUSY: 'speechBusy',
};

export const speechErrorKey = (code: string): MessageKey =>
  Object.hasOwn(errors, code) ? errors[code] : 'speechFailed';
