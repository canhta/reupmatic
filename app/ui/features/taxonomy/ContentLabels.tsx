import type { ContentEntry } from '../../../core/library/library-contracts';
import { useCatalog } from '../catalog/CatalogProvider';
import { LabelPicker } from './LabelPicker';

// Each change saves at once; the picker is disabled while the catalog is busy, so saves never overlap.
export function ContentLabels({ item, disabled }: { item: ContentEntry; disabled: boolean }) {
  const catalog = useCatalog();
  const record = catalog.snapshot?.content_labels.find((record) => record.id === item.id);
  return (
    <LabelPicker
      value={record?.label_ids ?? []}
      disabled={disabled}
      onChange={(label_ids) =>
        void catalog.mutate(() =>
          window.reupmatic.catalogContentLabels({
            id: item.id,
            label_ids,
            expected_revision: record?.revision ?? null,
          }),
        )
      }
    />
  );
}
