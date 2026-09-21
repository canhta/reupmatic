import type { MessageKey } from '../../locales/message-key';

const errors: Record<string, MessageKey> = {
  MODEL_HASH_MISMATCH: 'settingsOfferedHashMismatch',
  MODEL_DOWNLOAD_FAILED: 'settingsOfferedDownloadFailed',
  MODEL_ARCHITECTURE_UNIMPLEMENTED: 'settingsOfferedArchitectureUnknown',
  MODEL_CATALOGUE_INVALID: 'settingsOfferedCatalogueInvalid',
  MODEL_NOT_OFFERED: 'settingsOfferedNotOffered',
  SYNTHESIS_VOICES_UNAVAILABLE: 'settingsOfferedVoicesUnavailable',
  SPEECH_DISK_LOW: 'speechDiskLow',
  QUEUE_FULL: 'settingsOfferedBusy',
  CANCELLED: 'cancelled',
};

export const offeredModelErrorKey = (code: string): MessageKey =>
  errors[code] ?? 'settingsOfferedFailure';
