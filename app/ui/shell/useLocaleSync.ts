import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LOCALE_KEY = 'uiLocale';

/**
 * Keeps `document.documentElement.lang`, `localStorage` and the host's own confirm-dialog
 * language in sync with i18next. D-57 removed the independent Settings window (there is exactly
 * one `BrowserWindow`/renderer now), so this no longer also listens for a native `storage` event
 * from a second same-origin window — Settings changing the locale (LocaleSelect, reached through
 * `SettingsWorkspace` in this same window) already re-renders everything through the one i18next
 * instance, same as any other in-page change.
 */
export function useLocaleSync() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    localStorage.setItem(LOCALE_KEY, i18n.language);
    void window.reupmatic.uiLocale(i18n.language);
  }, [i18n.language]);
}
