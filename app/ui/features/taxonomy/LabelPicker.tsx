import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LabelKind } from '../../../core/taxonomy/taxonomy-types';
import { useCatalog, useUnsavedCatalogDraft } from '../catalog/CatalogProvider';

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
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LabelKind>('tag');
  const [newId, setNewId] = useState(() => crypto.randomUUID());
  useUnsavedCatalogDraft(Boolean(name));
  const labels = catalog.snapshot?.labels ?? [];
  const options = labels
    .filter((label) => !label.archived || value.includes(label.id))
    .map((label) => ({
      value: label.id,
      label: `${label.name} · ${t(`labelKind_${label.kind}`)}`,
    }));
  async function create() {
    const result = await catalog.mutate(() =>
      window.reupmatic.catalogSaveLabel({
        id: newId,
        expected_revision: null,
        name,
        kind,
        archived: false,
      }),
    );
    if (result) {
      onChange([...value, result.id]);
      setName('');
      setNewId(crypto.randomUUID());
    }
  }
  return (
    <div className="business-form">
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
      <Collapsible trigger={t('labelCreate')} defaultIsOpen={false}>
        <div className="business-toolbar">
          <TextInput
            label={t('catalogName')}
            value={name}
            onChange={setName}
            isDisabled={disabled || catalog.busy}
          />
          <Selector
            label={t('labelKind')}
            value={kind}
            isDisabled={disabled || catalog.busy}
            options={['tag', 'category', 'group'].map((value) => ({
              value,
              label: t(`labelKind_${value}`),
            }))}
            onChange={(value) => setKind(value as LabelKind)}
          />
          <Button
            label={t('labelCreateAndSelect')}
            isDisabled={disabled || catalog.busy || !name.trim() || value.length >= 30}
            onClick={() => void create()}
          />
        </div>
        <p className="field-help">{t('labelsSharedHelp')}</p>
      </Collapsible>
    </div>
  );
}
