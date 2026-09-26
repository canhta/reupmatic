import type { MessageKey } from '../../locales/message-key';

const errors: Record<string, MessageKey> = {
  MODEL_HASH_MISMATCH: 'settingsOfferedHashMismatch',
  MODEL_DOWNLOAD_FAILED: 'settingsOfferedDownloadFailed',
  MODEL_ARCHITECTURE_UNIMPLEMENTED: 'settingsOfferedArchitectureUnknown',
  MODEL_CATALOGUE_INVALID: 'settingsOfferedCatalogueInvalid',
  MODEL_NOT_OFFERED: 'settingsOfferedNotOffered',
  SYNTHESIS_VOICES_UNAVAILABLE: 'settingsOfferedVoicesUnavailable',
  SPEECH_DISK_LOW: 'speechDiskLow',
  RUNTIME_PACK_DISK_LOW: 'settingsOfferedPackDiskLow',
  PACK_DOWNLOAD_FAILED: 'settingsOfferedPackDownloadFailed',
  PACK_HASH_MISMATCH: 'settingsOfferedPackHashMismatch',
  PACK_EXTRACT_FAILED: 'settingsOfferedPackExtractFailed',
  RUNTIME_PACK_UNAVAILABLE: 'settingsOfferedPackUnavailable',
  QUEUE_FULL: 'settingsOfferedBusy',
  CANCELLED: 'cancelled',
  WORKER_EXITED: 'settingsOfferedWorkerUnavailable',
  WORKER_START_FAILED: 'settingsOfferedWorkerUnavailable',
  INVALID_WORKER_RESPONSE: 'settingsOfferedWorkerUnavailable',
};

export const offeredModelErrorKey = (code: string): MessageKey =>
  errors[code] ?? 'settingsOfferedFailure';
