import type { MessageKey } from '../../locales/message-key';

/** Maps a diagnostics action's failure code to the sentence the row shows. */
export function diagnosticsErrorKey(code: string): MessageKey {
  return code === 'APP_CLOSING' ? 'settingsDiagnosticsClosing' : 'settingsDiagnosticsFailure';
}
