/**
 * The locales the application's own interface ships in. English and Vietnamese ship together,
 * so this is the one list a boundary checks against when it needs
 * to know that something is presentable to every reader — the renderer's `app/ui/locales/<id>/`
 * directories are the matching half, and adding a locale means adding it in both places.
 *
 * This is deliberately not the same thing as `SpeechLanguage` (the languages a model can
 * *recognise*, `app/core/speech/recognition.ts`): a user may transcribe Chinese speech through
 * an English interface.
 */
export const UI_LOCALES = ['en', 'vi'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);
}

/**
 * Text the same reader sees in their own interface language, carried as data rather than as a
 * translation key — a catalogue entry a user writes by hand cannot add keys to the renderer's
 * locale files, so it supplies the strings themselves. Every UI locale is required: a partially
 * translated entry is refused at configuration time rather than rendered half in English.
 */
export type LocalisedText = { readonly [locale in UiLocale]: string };
