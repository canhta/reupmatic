import { assertCues, type Cue } from './cues.js';

export interface TextRule { mode: 'literal' | 'regex'; find: string; replacement: string; case_sensitive: boolean }
export interface TextRulePreview {
  cues: Cue[];
  matched_cues: number;
  replacements: number;
  changes: { id: string; before: string; after: string }[];
}

export function parseTextRule(value: unknown): TextRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TEXT_RULE_INVALID');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 4 || !['literal', 'regex'].includes(String(input.mode))
    || typeof input.find !== 'string' || !input.find || input.find.length > 512 || input.find.includes('\0')
    || typeof input.replacement !== 'string' || input.replacement.length > 10000 || input.replacement.includes('\0')
    || typeof input.case_sensitive !== 'boolean') throw new Error('TEXT_RULE_INVALID');
  return { mode: input.mode as TextRule['mode'], find: input.find, replacement: input.replacement,
    case_sensitive: input.case_sensitive };
}

function selectedScope(cues: Cue[], ids?: string[]): Set<string> | undefined {
  if (ids === undefined) return undefined;
  const available = new Set(cues.map(cue => cue.id));
  if (!Array.isArray(ids) || !ids.length || ids.some(id => !available.has(id))) {
    throw new Error('TEXT_RULE_SCOPE');
  }
  return new Set(ids);
}

export function previewTextRule(cues: Cue[], input: TextRule, ids?: string[]): TextRulePreview {
  assertCues(cues);
  const rule = parseTextRule(input);
  const selected = selectedScope(cues, ids);
  const pattern = rule.mode === 'regex' ? rule.find : rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let expression: RegExp;
  try { expression = new RegExp(pattern, rule.case_sensitive ? 'gu' : 'giu'); }
  catch { throw new Error('TEXT_RULE_INVALID'); }
  let matched_cues = 0, replacements = 0, outputBytes = 0;
  const changes: TextRulePreview['changes'] = [];
  const encoder = new TextEncoder();
  const result = cues.map(cue => {
    if (selected && !selected.has(cue.id)) {
      outputBytes += encoder.encode(cue.text).length;
      if (outputBytes > 1024 * 1024) throw new Error('TEXT_RULE_LIMIT');
      return { ...cue };
    }
    let matches = 0;
    for (const _ of cue.text.matchAll(expression)) {
      matches += 1;
      if (replacements + matches > 100000) throw new Error('TEXT_RULE_LIMIT');
    }
    const text = rule.mode === 'literal' ? cue.text.replace(expression, () => rule.replacement)
      : cue.text.replace(expression, rule.replacement);
    if (text !== cue.text) {
      matched_cues += 1;
      if (changes.length < 100) changes.push({ id: cue.id, before: cue.text, after: text });
    }
    replacements += matches;
    outputBytes += encoder.encode(text).length;
    if (text.length > 10000 || outputBytes > 1024 * 1024) throw new Error('TEXT_RULE_LIMIT');
    return { ...cue, text };
  });
  assertCues(result);
  return { cues: result, matched_cues, replacements, changes };
}

export function shiftCueTimes(cues: Cue[], delta: number, duration: number, ids?: string[]): Cue[] {
  assertCues(cues);
  const selected = selectedScope(cues, ids);
  if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(duration) || duration <= 0 || duration > 86400000) {
    throw new Error('SUBTITLE_SHIFT_RANGE');
  }
  const shifted = cues.map(cue => {
    if (selected && !selected.has(cue.id)) return { ...cue };
    const start_ms = cue.start_ms + delta, end_ms = cue.end_ms + delta;
    if (start_ms < 0 || end_ms > duration) throw new Error('SUBTITLE_SHIFT_RANGE');
    return { ...cue, start_ms, end_ms };
  });
  assertCues(shifted);
  return shifted;
}
