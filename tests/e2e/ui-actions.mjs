const languageNames = { en: 'English', vi: 'Tiếng Việt' };

export async function chooseLocale(page, locale) {
  if (!Object.hasOwn(languageNames, locale)) throw new Error(`Unsupported UI locale: ${locale}`);
  await page.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true }).click();
  await page.getByRole('option', { name: languageNames[locale], exact: true }).click();
  await page.waitForFunction(language => document.documentElement.lang === language, locale);
}
