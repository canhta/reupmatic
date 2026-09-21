import type { MessageKey } from '../../locales/message-key';

export function diagnosticsErrorKey(code: string): MessageKey {
  return code === 'APP_CLOSING' ? 'settingsDiagnosticsClosing' : 'settingsDiagnosticsFailure';
}
