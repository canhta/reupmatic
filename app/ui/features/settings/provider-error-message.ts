import type { MessageKey } from '../../locales/message-key';

const errors: Record<string, MessageKey> = {
  SPEECH_PROTOCOL_UNKNOWN: 'settingsProviderProtocolUnknown',
  CREDENTIAL_ENCRYPTION_UNAVAILABLE: 'settingsProviderEncryptionUnavailable',
  SPEECH_PROVIDER_NOT_FOUND: 'settingsProviderNotFound',
  SPEECH_MODEL_NOT_FOUND: 'settingsProviderModelNotFound',
  SPEECH_PROVIDER_STORE_INVALID: 'settingsProviderStoreInvalid',
  INVALID_REQUEST: 'settingsProviderInvalid',
};
export const providerErrorKey = (code: string): MessageKey =>
  errors[code] ?? 'settingsProviderSaveFailed';
