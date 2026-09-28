export interface TranslationRule {
  find: string;
  replace: string;
}
export type TranslationLanguage = 'en' | 'vi' | 'zh';
export type TranslationSource = 'transcript' | 'displayed';
export type TranslationPolicy = 'keep-existing' | 'replace-all';

export function parseTranslationRules(value: unknown): TranslationRule[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('INVALID_TRANSLATION_RULES');
  for (const rule of value) {
    if (
      !rule ||
      typeof rule !== 'object' ||
      Array.isArray(rule) ||
      Object.keys(rule).length !== 2 ||
      typeof rule.find !== 'string' ||
      !rule.find.trim() ||
      typeof rule.replace !== 'string' ||
      rule.find.length > 256 ||
      rule.replace.length > 256 ||
      rule.find.includes('\0') ||
      rule.replace.includes('\0')
    )
      throw new Error('INVALID_TRANSLATION_RULES');
  }
  return structuredClone(value) as TranslationRule[];
}
