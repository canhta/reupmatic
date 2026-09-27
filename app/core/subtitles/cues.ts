import { parseSubtitleStyle, type SubtitleStyle } from './style.js';

export interface CueWord {
  text: string;
  start_ms: number;
  end_ms: number;
}
export interface Cue {
  id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  style?: SubtitleStyle;
  /** Word timings measured from speech; absent means render-time estimation. */
  words?: CueWord[];
  /** The source cue a derived (translated or copied) line was produced from. */
  source_cue_id?: string;
  /** Set on the extra pieces of a composition split; the cue they were cut from. */
  split_from_cue_id?: string;
}
const CUE_KEYS = [
  'id',
  'start_ms',
  'end_ms',
  'text',
  'style',
  'words',
  'source_cue_id',
  'split_from_cue_id',
];
const WORD_KEYS = ['text', 'start_ms', 'end_ms'];
const MAX_CUE_WORDS = 2000;

/** Word timings are valid only when they partition the cue text exactly, in order. */
function wordsJoin(
  text: string,
  start_ms: number,
  end_ms: number,
  words: unknown,
): words is CueWord[] {
  if (!Array.isArray(words) || !words.length || words.length > MAX_CUE_WORDS) return false;
  let previous = start_ms;
  let joined = '';
  for (const word of words) {
    if (
      !word ||
      typeof word !== 'object' ||
      Array.isArray(word) ||
      Object.keys(word).length !== WORD_KEYS.length ||
      WORD_KEYS.some((key) => !(key in word))
    )
      return false;
    const value = word as Record<string, unknown>;
    if (
      typeof value.text !== 'string' ||
      !value.text.length ||
      value.text.length > 10000 ||
      value.text.includes('\0') ||
      !Number.isInteger(value.start_ms) ||
      !Number.isInteger(value.end_ms) ||
      Number(value.start_ms) < previous ||
      Number(value.start_ms) < start_ms ||
      Number(value.end_ms) > end_ms ||
      Number(value.end_ms) < Number(value.start_ms)
    )
      return false;
    previous = Number(value.end_ms);
    joined += value.text;
    if (joined.length > text.length) return false;
  }
  return joined === text;
}

/** Optional cue references are token-like ids; empty or NUL values are invalid. */
function cueReference(value: unknown): boolean {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('\0')
  );
}

export function assertCues(cues: unknown): asserts cues is Cue[] {
  if (!Array.isArray(cues)) throw new Error('INVALID_CUES');
  const seen = new Set<string>();
  if (cues.length > 10000) throw new Error('INVALID_CUES');
  for (const c of cues) {
    if (
      !c ||
      typeof c !== 'object' ||
      Array.isArray(c) ||
      Object.keys(c).some((key) => !CUE_KEYS.includes(key)) ||
      typeof c.id !== 'string' ||
      !c.id ||
      c.id.length > 128 ||
      c.id.includes('\0') ||
      seen.has(c.id) ||
      !Number.isInteger(c.start_ms) ||
      !Number.isInteger(c.end_ms) ||
      c.start_ms < 0 ||
      c.end_ms <= c.start_ms ||
      c.end_ms > 86400000 ||
      typeof c.text !== 'string' ||
      c.text.length > 10000 ||
      c.text.includes('\0')
    )
      throw new Error('INVALID_CUES');
    if ('style' in c) parseSubtitleStyle(c.style);
    if ('words' in c && !wordsJoin(c.text, c.start_ms, c.end_ms, c.words))
      throw new Error('INVALID_CUES');
    if ('source_cue_id' in c && !cueReference(c.source_cue_id)) throw new Error('INVALID_CUES');
    if ('split_from_cue_id' in c && !cueReference(c.split_from_cue_id))
      throw new Error('INVALID_CUES');
    seen.add(c.id);
  }
}

function mapLinear(
  time: number,
  fromStart: number,
  fromEnd: number,
  toStart: number,
  toEnd: number,
) {
  if (fromEnd === fromStart) return toStart;
  return toStart + Math.round(((time - fromStart) * (toEnd - toStart)) / (fromEnd - fromStart));
}

/** Clamp mapped word edges into the cue window, keeping order and non-overlap. */
function fitWords(words: CueWord[], start_ms: number, end_ms: number): CueWord[] {
  let previous = start_ms;
  return words.map((word) => {
    const begin = Math.min(Math.max(word.start_ms, previous), end_ms);
    const finish = Math.min(Math.max(word.end_ms, begin), end_ms);
    previous = finish;
    return { text: word.text, start_ms: begin, end_ms: finish };
  });
}

/** Maps every word through `map` and fits it into the cue's new window. */
export function remapCueWords(
  cue: Cue,
  map: (timeMs: number) => number,
  start_ms: number,
  end_ms: number,
): Cue {
  if (!cue.words) return { ...cue, start_ms, end_ms };
  const mapped = cue.words.map((word) => ({
    text: word.text,
    start_ms: map(word.start_ms),
    end_ms: map(word.end_ms),
  }));
  return { ...cue, start_ms, end_ms, words: fitWords(mapped, start_ms, end_ms) };
}

/** Changes a cue's text; measured words no longer describe it, so they are dropped. */
export function setCueText(cue: Cue, text: string): Cue {
  const { words: _words, ...rest } = cue;
  return { ...rest, text };
}

/** Moves a cue's edges; word timings scale with it. */
export function setCueTime(cue: Cue, start_ms: number, end_ms: number): Cue {
  return remapCueWords(
    cue,
    (time) => mapLinear(time, cue.start_ms, cue.end_ms, start_ms, end_ms),
    start_ms,
    end_ms,
  );
}
export function splitCue(
  cues: Cue[],
  id: string,
  atMs: number,
  atCharacter: number,
  newId: string,
): Cue[] {
  const selected = cues.find((c) => c.id === id);
  if (
    !selected ||
    atMs <= selected.start_ms ||
    atMs >= selected.end_ms ||
    !Number.isInteger(atCharacter) ||
    atCharacter < 0 ||
    atCharacter > selected.text.length
  )
    throw new Error('SPLIT_RANGE');
  // Avoid cutting a UTF-16 surrogate pair. Vietnamese code points are preserved.
  if (atCharacter > 0 && /[\uD800-\uDBFF]/u.test(selected.text[atCharacter - 1]))
    throw new Error('SPLIT_RANGE');
  // Each half has new text, so neither keeps the original measured words.
  const out = cues.flatMap((c) =>
    c.id !== id
      ? [{ ...c }]
      : [
          { ...setCueText(c, c.text.slice(0, atCharacter)), end_ms: atMs },
          { ...setCueText(c, c.text.slice(atCharacter)), id: newId, start_ms: atMs },
        ],
  );
  assertCues(out);
  return out;
}
export function mergeNext(cues: Cue[], id: string): Cue[] {
  const index = cues.findIndex((c) => c.id === id);
  if (index < 0 || index + 1 >= cues.length) throw new Error('MERGE_RANGE');
  const a = cues[index],
    b = cues[index + 1];
  const out = cues
    .filter((_, i) => i !== index + 1)
    .map((c) =>
      c.id !== id
        ? { ...c }
        : {
            ...setCueText(a, `${a.text}\n${b.text}`),
            start_ms: Math.min(a.start_ms, b.start_ms),
            end_ms: Math.max(a.end_ms, b.end_ms),
          },
    );
  assertCues(out);
  return out;
}
export function resultIsCurrent(
  revision: number,
  current: number,
  requestId: string,
  latestRequestId: string,
): boolean {
  return revision === current && requestId === latestRequestId;
}
