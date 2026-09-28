import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { StackItem } from '@astryxdesign/core/Stack';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProcessingRecipe } from '../../../core/processing/recipe';
import { PanelRow, PanelRows, PanelStatus } from '../../design-system/Panel';
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
    <VStack gap={2}>
      <PanelRows>
        <PanelRow label={t('profilePicker')}>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <Selector
                label={t('profilePicker')}
                isLabelHidden
                value={selected}
                onChange={setSelected}
                isDisabled={disabled || !profiles.length}
                placeholder={t(profiles.length ? 'profileChoose' : 'profileNoSaved')}
                options={profiles.map((item) => ({ value: item.id, label: item.name }))}
              />
            </StackItem>
            <Button
              label={t('profileApply')}
              tooltip={conflict ? t('profileSubtitleConflict') : undefined}
              isDisabled={disabled || !profile || conflict}
              onClick={() => {
                if (profile && !conflict) onApply(structuredClone(profile.processing ?? undefined));
              }}
            />
          </HStack>
        </PanelRow>
      </PanelRows>
      {conflict && <PanelStatus tone="warning" text={t('profileOcrConflict')} />}
    </VStack>
  );
}
