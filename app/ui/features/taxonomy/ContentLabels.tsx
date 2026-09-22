import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContentEntry } from '../../../core/library/library-contracts';
import { useCatalog, useUnsavedCatalogDraft } from '../catalog/CatalogProvider';
import { LabelPicker } from './LabelPicker';

interface LabelDraft {
  label_ids: string[];
  expected_revision: number | null;
}
export function ContentLabels({
  item,
  disabled,
}: {
  item: ContentEntry | null;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const [drafts, setDrafts] = useState<Record<string, LabelDraft>>({});
  useUnsavedCatalogDraft(Object.keys(drafts).length > 0);
  const record = item && catalog.snapshot?.content_labels.find((record) => record.id === item.id);
  const saved = { label_ids: record?.label_ids ?? [], expected_revision: record?.revision ?? null };
  const draft = item ? (drafts[item.id] ?? saved) : saved;
  async function save() {
    if (!item) return;
    const id = item.id;
    const result = await catalog.mutate(() =>
      window.reupmatic.catalogContentLabels({ id, ...draft }),
    );
    if (result)
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
  }
  return (
    <div className="business-workspace">
      {Object.keys(drafts).length > 0 && (
        <Text as="p" type="body" role="status">
          {t('contentLabelDrafts', { count: Object.keys(drafts).length })}
        </Text>
      )}
      {item && (
        <VStack gap={3}>
          <Heading level={5}>{t('contentLabelsTitle', { name: item.name })}</Heading>
          <LabelPicker
            value={draft.label_ids}
            disabled={disabled}
            onChange={(label_ids) =>
              setDrafts((current) => ({ ...current, [item.id]: { ...draft, label_ids } }))
            }
          />
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button
              label={t('contentLabelsSave')}
              isDisabled={disabled || catalog.busy || !drafts[item.id]}
              onClick={() => void save()}
            />
            <Button
              label={t('catalogReset')}
              isDisabled={disabled || catalog.busy || !drafts[item.id]}
              onClick={() =>
                setDrafts((current) => {
                  const next = { ...current };
                  delete next[item.id];
                  return next;
                })
              }
            />
          </HStack>
        </VStack>
      )}
    </div>
  );
}
