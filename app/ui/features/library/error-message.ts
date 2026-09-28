import type { MessageKey } from '../../locales/message-key';

const errors: Record<string, MessageKey> = {
  LIBRARY_IN_USE: 'libraryInUse',
  LIBRARY_UNAVAILABLE: 'libraryUnavailable',
  LIBRARY_VERSION: 'libraryUnavailable',
  SOURCE_UNAVAILABLE: 'librarySourceMissing',
  ENOENT: 'librarySourceMissing',
  SOURCE_CHANGED: 'librarySourceChanged',
  LIBRARY_ITEM_MISSING: 'librarySourceMissing',
  SELECTION_LIMIT: 'libraryLimit',
  LIBRARY_LIMIT: 'libraryLimit',
  STALE_OPERATION: 'libraryStaleOpen',
  LIBRARY_BUSY: 'libraryBusy',
  EDITOR_BUSY: 'libraryBusy',
};
export const libraryErrorKey = (code: string): MessageKey => errors[code] ?? 'libraryError';
