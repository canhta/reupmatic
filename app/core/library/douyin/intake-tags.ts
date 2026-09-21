/**
 * Maps Douyin hashtags onto the existing shared taxonomy.
 *
 * A Douyin hashtag is a `tag` label like any hand-applied tag — there is deliberately no parallel
 * `douyin_tags` field on the content record (`spec.md`, "Tags"; one current contract per
 * boundary). The `hashtag_id` provenance stays in the intake record; the shared `Label`
 * contract is not widened for one connector's bookkeeping.
 */

import { createHash } from 'node:crypto';
import type { ContentLabels, Label, LabelData } from '../../taxonomy/taxonomy-contracts.js';
import type { DouyinTag } from './intake-contracts.js';

/** The slice of `TaxonomyStore` this needs, so the mapping tests without the whole catalog. */
export interface TagLabelCatalog {
  list(): Label[];
  content(): ContentLabels[];
  save(input: unknown): Label;
  assignContent(input: unknown): ContentLabels;
}

function normalized(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

/**
 * A deterministic label id derived from the normalized tag text, so the same hashtag resolves to
 * one label across items instead of a new one per intake.
 */
export function douyinTagLabelId(name: string): string {
  const digest = createHash('sha256').update(normalized(name)).digest('hex').slice(0, 24);
  return `tag-${digest}`;
}

/** The `tag` labels a hashtag set becomes, deduped by normalized name. */
export function douyinTagLabelData(tags: readonly DouyinTag[]): LabelData[] {
  const seen = new Set<string>();
  const labels: LabelData[] = [];
  for (const tag of tags) {
    const name = tag.name.trim();
    if (!name || seen.has(normalized(name))) continue;
    seen.add(normalized(name));
    labels.push({ name, kind: 'tag', archived: false });
  }
  return labels;
}

/**
 * Ensures one `tag` label exists per hashtag and assigns the set to `contentId` through
 * `assignContent`'s `label_ids`, reusing an existing label when the normalized name already
 * matches (a hand-applied tag and an intake hashtag are the same label).
 */
export function assignDouyinTags(
  catalog: TagLabelCatalog,
  contentId: string,
  tags: readonly DouyinTag[],
): ContentLabels {
  const known = catalog.list();
  const labelIds: string[] = [];
  for (const label of douyinTagLabelData(tags)) {
    const existing = known.find(
      (candidate) =>
        candidate.kind === 'tag' && normalized(candidate.name) === normalized(label.name),
    );
    if (existing) {
      labelIds.push(existing.id);
      continue;
    }
    const saved = catalog.save({
      id: douyinTagLabelId(label.name),
      expected_revision: null,
      name: label.name,
      kind: 'tag',
      archived: false,
    });
    known.push(saved);
    labelIds.push(saved.id);
  }
  const previous = catalog.content().find((record) => record.id === contentId);
  // Merge rather than replace: a re-intake must not drop labels the user already applied.
  const merged = Array.from(new Set([...(previous?.label_ids ?? []), ...labelIds]));
  return catalog.assignContent({
    id: contentId,
    expected_revision: previous?.revision ?? null,
    label_ids: merged,
  });
}
