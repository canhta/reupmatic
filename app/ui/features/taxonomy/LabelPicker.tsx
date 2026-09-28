import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../catalog/CatalogProvider';

export function LabelPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange(ids: string[]): void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const labels = catalog.snapshot?.labels ?? [];
  const options = labels
    .filter((label) => !label.archived || value.includes(label.id))
    .map((label) => ({
      value: label.id,
      label: `${label.name} · ${t(`labelKind_${label.kind}`)}`,
    }));
  return (
    <MultiSelector
      label={t('catalogLabels')}
      value={value}
      onChange={onChange}
      options={options}
      triggerDisplay="labels"
      hasSearch
      isDisabled={disabled || catalog.busy || !catalog.snapshot}
      emptyText={t('labelsEmpty')}
      emptySearchText={t('catalogNoMatches')}
      searchPlaceholder={t('catalogSearch')}
    />
  );
}
