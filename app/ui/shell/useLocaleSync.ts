import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LOCALE_KEY = 'uiLocale';

export function useLocaleSync() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    localStorage.setItem(LOCALE_KEY, i18n.language);
    void window.reupmatic.uiLocale(i18n.language);
  }, [i18n.language]);
}
