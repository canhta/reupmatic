import { createHash } from 'node:crypto';
import type { ContentLabels, Label, LabelData } from '../../taxonomy/taxonomy-contracts.js';
import type { DouyinTag } from './intake-contracts.js';

export interface TagLabelCatalog {
  list(): Label[];
  content(): ContentLabels[];
  save(input: unknown): Label;
  assignContent(input: unknown): ContentLabels;
}

function normalized(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

export function douyinTagLabelId(name: string): string {
  const digest = createHash('sha256').update(normalized(name)).digest('hex').slice(0, 24);
  return `tag-${digest}`;
}

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
  const merged = Array.from(new Set([...(previous?.label_ids ?? []), ...labelIds]));
  return catalog.assignContent({
    id: contentId,
    expected_revision: previous?.revision ?? null,
    label_ids: merged,
  });
}
