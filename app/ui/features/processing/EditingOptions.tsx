import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../core/editing/edit-recipe';
import { AudioTools } from '../editor/audio-tools/AudioTools';
import { FadeTools } from '../editor/video-tools/FadeTools';
import { VideoTools } from '../editor/video-tools/VideoTools';

export function EditingOptions({
  value,
  disabled,
  onChange,
}: {
  value?: EditingRecipe;
  disabled: boolean;
  onChange(value: EditingRecipe | undefined): void;
}) {
  const { t } = useTranslation();
  function update(patch: Partial<EditingRecipe>) {
    const next = { ...value, ...patch };
    for (const key of Object.keys(next) as (keyof EditingRecipe)[]) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(Object.keys(next).length ? next : undefined);
  }
  return (
    <VStack gap={3}>
      <CollapsibleGroup type="multiple" hasDividers density="compact">
        <Collapsible
          value="video"
          trigger={
            <Text type="body" weight="semibold">
              {t('editVideoTitle')}
            </Text>
          }
          defaultIsOpen={false}
        >
          <VideoTools
            value={value ?? {}}
            disabled={disabled}
            onChange={update}
            toggle={CheckboxInput}
          />
        </Collapsible>
        <Collapsible
          value="fade"
          trigger={
            <Text type="body" weight="semibold">
              {t('editFadeTitle')}
            </Text>
          }
          defaultIsOpen={false}
        >
          <FadeTools
            value={value ?? {}}
            disabled={disabled}
            onChange={update}
            toggle={CheckboxInput}
          />
        </Collapsible>
        <Collapsible
          value="audio"
          trigger={
            <Text type="body" weight="semibold">
              {t('editAudioTitle')}
            </Text>
          }
          defaultIsOpen={false}
        >
          <AudioTools
            value={value ?? {}}
            disabled={disabled}
            onChange={update}
            toggle={CheckboxInput}
          />
        </Collapsible>
      </CollapsibleGroup>
      {value && (
        <Button label={t('editReset')} isDisabled={disabled} onClick={() => onChange(undefined)} />
      )}
    </VStack>
  );
}
