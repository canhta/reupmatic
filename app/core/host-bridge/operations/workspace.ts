import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

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
  'session-close-result': operation<{ request_id: string; completed: boolean }, null>()({
    rendererMethod: 'sessionCloseResult',
    validate: (input) => {
      const value = requestRecord(input, ['request_id', 'completed']);
      if (typeof value.completed !== 'boolean') throw new Error('INVALID_REQUEST');
      return { request_id: requestId(value.request_id), completed: value.completed };
    },
    toRequest: (request_id: string, completed: boolean) => ({ request_id, completed }),
  }),
} as const;
