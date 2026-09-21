import { operation } from '../operation-contract.js';
import { requestRecord } from '../validators.js';

// D-57 removed the independent Settings window and its 'app-open-settings' operation: opening
// Settings (and landing on one of its categories) is a pure in-renderer navigation now — the
// sidebar's own area/category state (App.tsx) — with no host round trip, so it no longer needs a
// wire operation or the SettingsTab type this file used to mirror by hand.
export const appOperations = {
  // Quit and install an update that is already downloaded (electron-updater). No payload: the
  // updater holds the pending update; the renderer only asks to apply it.
  'app-install-update': operation<undefined, null>()({
    rendererMethod: 'appInstallUpdate',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'session-dirty': operation<{ dirty: boolean }, null>()({
    rendererMethod: 'sessionDirty',
    validate: (input) => {
      const value = requestRecord(input, ['dirty']);
      if (typeof value.dirty !== 'boolean') throw new Error('INVALID_REQUEST');
      return { dirty: value.dirty };
    },
    toRequest: (dirty: boolean) => ({ dirty }),
  }),
  'ui-locale': operation<{ language: 'en' | 'vi' }, null>()({
    rendererMethod: 'uiLocale',
    validate: (input) => {
      const value = requestRecord(input, ['language']);
      if (!['en', 'vi'].includes(String(value.language))) throw new Error('INVALID_REQUEST');
      return { language: value.language === 'vi' ? 'vi' : 'en' };
    },
    // The renderer's own locale value is a plain string (see app/ui/shell/); `validate` is what
    // actually narrows it, exactly like every other operation's untrusted wire payload.
    toRequest: (language: string) => ({ language: language as 'en' | 'vi' }),
  }),
} as const;
