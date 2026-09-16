import { parseSubtitleStyle, type SubtitleStyle } from './style.js';
/** Product edit commands, not a replacement subtitle parser or timeline widget. */
export interface Cue {
  id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  style?: SubtitleStyle;
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
      Object.keys(c).some((key) => !['id', 'start_ms', 'end_ms', 'text', 'style'].includes(key)) ||
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
    seen.add(c.id);
  }
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
  const out = cues.flatMap((c) =>
    c.id !== id
      ? [{ ...c }]
      : [
          { ...c, end_ms: atMs, text: c.text.slice(0, atCharacter) },
          { ...c, id: newId, start_ms: atMs, text: c.text.slice(atCharacter) },
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
            ...a,
            start_ms: Math.min(a.start_ms, b.start_ms),
            end_ms: Math.max(a.end_ms, b.end_ms),
            text: `${a.text}\n${b.text}`,
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
