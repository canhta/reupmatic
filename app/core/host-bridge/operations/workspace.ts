import { operation } from '../operation-contract.js';
import { requestRecord } from '../validators.js';

export const appOperations = {
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
    toRequest: (language: string) => ({ language: language as 'en' | 'vi' }),
  }),
} as const;
