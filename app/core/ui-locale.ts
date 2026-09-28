export const UI_LOCALES = ['en', 'vi'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);
}

// Carried as data, not a translation key; every UI locale is required.
export type LocalisedText = { readonly [locale in UiLocale]: string };
