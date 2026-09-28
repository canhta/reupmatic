import type { MessageKey } from '../../locales/message-key';

export function modelStatusKey(available: boolean, code: string | null): MessageKey {
  if (available) return 'visionConfigured';
  switch (code) {
    case 'MODEL_MANIFEST_INVALID':
      return 'settingsModelManifestInvalid';
    case 'MODEL_HASH_MISMATCH':
      return 'settingsModelFilesChanged';
    case 'MODEL_LANGUAGE_UNAVAILABLE':
      return 'settingsModelLanguageUnavailable';
    case 'MODEL_RUNTIME_MISSING':
      return 'settingsModelRuntimeMissing';
    case 'RUNTIME_PACK_MISSING':
      return 'settingsModelRuntimePackMissing';
    case 'MODEL_NETWORK_DISABLED':
      return 'settingsModelNetworkBlocked';
    case 'MODEL_MISSING':
    case null:
      return 'visionMissing';
    default:
      return 'settingsModelStatusUnknown';
  }
}

export function statedModelStatusKey(available: boolean, code: string | null): MessageKey | null {
  const key = modelStatusKey(available, code);
  return key === 'visionMissing' ? null : key;
}
