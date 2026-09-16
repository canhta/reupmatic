import { parseTranslationRules, type TranslationLanguage, type TranslationPolicy,
  type TranslationRule, type TranslationSource } from '../../speech/translation/rules.js';

export interface TranslationOrigin {
  kind: 'translation'; layer: TranslationSource; token: string; request_id: string;
  source_language: TranslationLanguage; target_language: TranslationLanguage;
  model_id: string; runtime: string; rules: TranslationRule[]; policy: TranslationPolicy;
}

export function validTranslationOrigin(value: Record<string, unknown>): boolean {
  const keys = ['kind', 'layer', 'token', 'request_id', 'source_language', 'target_language',
    'model_id', 'runtime', 'rules', 'policy'];
  if (value.kind !== 'translation' || Object.keys(value).length !== keys.length || !keys.every(key => key in value)
    || typeof value.layer !== 'string' || !['transcript', 'displayed'].includes(value.layer)
    || typeof value.policy !== 'string' || !['keep-existing', 'replace-all'].includes(value.policy)
    || typeof value.model_id !== 'string' || !/^[a-f0-9]{64}$/.test(value.model_id)
    || typeof value.runtime !== 'string' || !value.runtime || value.runtime.length > 128 || value.runtime.includes('\0')
    || ['token', 'request_id'].some(key => typeof value[key] !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(value[key]))
    || ['source_language', 'target_language'].some(key => typeof value[key] !== 'string' || !['en', 'vi', 'zh'].includes(value[key]))
    || value.source_language === value.target_language) return false;
  try { parseTranslationRules(value.rules); return true; } catch { return false; }
}
