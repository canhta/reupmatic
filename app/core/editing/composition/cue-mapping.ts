import { assertCues, type Cue } from '../../subtitles/cues.js';
import { compositionSpans, type ClipSpan, type Composition } from './document.js';

/** Map edited output text back through the old clip, then into its surviving cuts.
 * Aliases are explicit split/join ancestry, never inferred from equal filenames. */
export function remapCompositionCues(
  before: Composition, after: Composition, cues: Cue[], ancestry: Map<string, string[]> = new Map(),
): Cue[] {
  assertCues(cues);
  const previous = compositionSpans(before), next = compositionSpans(after);
  const descendants = new Map<string, ClipSpan[]>();
  for (const target of next) {
    for (const oldId of ancestry.get(target.clip.id) ?? [target.clip.id]) {
      descendants.set(oldId, [...(descendants.get(oldId) ?? []), target]);
    }
  }
  const used = new Set(cues.map(cue => cue.id));
  const result: Cue[] = [];
  for (const cue of cues) {
    let pieces = 0;
    for (const old of previous) {
      const first = Math.max(cue.start_ms, old.start_ms), last = Math.min(cue.end_ms, old.end_ms);
      if (last <= first) continue;
      const sourceStart = old.clip.start_ms + (first - old.start_ms) * old.clip.speed;
      const sourceEnd = old.clip.start_ms + (last - old.start_ms) * old.clip.speed;
      for (const target of descendants.get(old.clip.id) ?? []) {
        const start = Math.max(sourceStart, target.clip.start_ms), end = Math.min(sourceEnd, target.clip.end_ms);
        if (end <= start) continue;
        const start_ms = target.start_ms + Math.round((start - target.clip.start_ms) / target.clip.speed);
        const end_ms = Math.min(target.end_ms, target.start_ms + Math.round((end - target.clip.start_ms) / target.clip.speed));
        if (end_ms <= start_ms) continue;
        let id = cue.id;
        if (pieces++) {
          let suffix = pieces;
          do { id = `${cue.id.slice(0, 110)}~${suffix++}`; } while (used.has(id));
          used.add(id);
        }
        if (result.length >= 10000) throw new Error('COMPOSITION_CUE_LIMIT');
        result.push({ ...structuredClone(cue), id, start_ms, end_ms });
      }
    }
  }
  result.sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms || a.id.localeCompare(b.id));
  assertCues(result);
  return result;
}
