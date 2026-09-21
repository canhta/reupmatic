import type { MessageKey } from '../../locales/message-key';

// Row labels stay noun+state; visionErrorKey sentences belong in job-error banners.
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
    case 'MODEL_NETWORK_DISABLED':
      return 'settingsModelNetworkBlocked';
    case 'MODEL_MISSING':
    case null:
      return 'visionMissing';
    default:
      return 'settingsModelStatusUnknown';
  }
}

/**
 * The status worth stating beside a row that already carries its own setup action. A plain
 * "not configured" repeats what the action says, so the row shows the action alone; a real
 * fault still gets named.
 */
export function statedModelStatusKey(available: boolean, code: string | null): MessageKey | null {
  const key = modelStatusKey(available, code);
  return key === 'visionMissing' ? null : key;
}
