import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessingRecipe } from '../../../core/processing/recipe';
import { useCatalog } from '../catalog/CatalogProvider';

export function ProfilePicker({
  onApply,
  disabled = false,
  hasSubtitles = false,
}: {
  onApply(recipe: ProcessingRecipe | undefined): void;
  disabled?: boolean;
  hasSubtitles?: boolean;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const [selected, setSelected] = useState('');
  const profiles = catalog.snapshot?.profiles.filter((profile) => !profile.archived) ?? [];
  const profile = profiles.find((item) => item.id === selected);
  const conflict = Boolean(hasSubtitles && profile?.processing?.ocr);

  return (
    <VStack gap={3}>
      <HStack gap={2} vAlign="end" wrap="wrap">
        <Selector
          label={t('profileOptional')}
          value={selected}
          onChange={setSelected}
          isDisabled={disabled || !profiles.length}
          options={profiles.map((item) => ({ value: item.id, label: item.name }))}
        />
        <Button
          label={t('profileApply')}
          isDisabled={disabled || !profile || conflict}
          onClick={() => {
            if (profile && !conflict) onApply(structuredClone(profile.processing ?? undefined));
          }}
        />
      </HStack>
      {!profiles.length && (
        <Text as="p" type="supporting">
          {t('profileNoSaved')}
        </Text>
      )}
      {conflict && (
        <Text as="p" type="body" role="alert">
          {t('profileSubtitleConflict')}
        </Text>
      )}
    </VStack>
  );
}
