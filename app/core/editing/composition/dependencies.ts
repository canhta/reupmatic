import { type ClipSource, type Composition, parseComposition } from './document.js';

/** A file reference in a project is not a filesystem grant. Match all pinned fields. */
export function authorizedCompositionSources<
  T extends Pick<ClipSource, 'path' | 'sha256' | 'duration_ms'>,
>(input: Composition, granted: Iterable<T>): Map<string, T> {
  const composition = parseComposition(input);
  const records = [...granted];
  const result = new Map<string, T>();
  for (const clip of composition.clips) {
    const source = records.find(
      (item) =>
        item.path === clip.source.path &&
        item.sha256 === clip.source.sha256 &&
        item.duration_ms === clip.source.duration_ms,
    );
    if (!source) throw new Error('COMPOSITION_UNAUTHORIZED');
    result.set(clip.id, source);
  }
  return result;
}
