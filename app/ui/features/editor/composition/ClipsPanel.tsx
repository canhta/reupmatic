import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe, TimeRange } from '../../../../core/editing/edit-recipe';
import { resolveEditWindow } from '../../../../core/editing/edit-recipe';
import type { ProcessingRecipe } from '../../../../core/processing/recipe';
import { useEditor } from '../EditorContext';
import { FadeTools } from '../video-tools/FadeTools';
import { LogoTools } from '../video-tools/LogoTools';
import { VideoTools } from '../video-tools/VideoTools';
import { CompositionPanel } from './CompositionPanel';

export function ClipsPanel() {
  const editor = useEditor();
  const disabled = editor.opening || editor.busy;
  return (
    <VStack gap={5}>
      {editor.composition ? <CompositionPanel /> : <WholeVideoClip />}
      <GlobalEditSections disabled={disabled} />
    </VStack>
  );
}

function GlobalEditSections({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const editing = editor.processing?.editing;

  function update(patch: Partial<EditingRecipe>) {
    const next: EditingRecipe = { ...editing, ...patch };
    for (const key of Object.keys(next) as (keyof EditingRecipe)[]) {
      if (next[key] === undefined) delete next[key];
    }
    const recipe: ProcessingRecipe = { ...editor.processing, editing: next };
    if (!Object.keys(next).length) delete recipe.editing;
    editor.changeProcessing(Object.keys(recipe).length > 0 ? recipe : undefined);
  }

  return (
    <VStack gap={2}>
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
            {t('editVideoTitle')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <VideoTools value={editing ?? {}} disabled={disabled} onChange={update} />
      </Collapsible>
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
            {t('editFadeTitle')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <FadeTools value={editing ?? {}} disabled={disabled} onChange={update} />
      </Collapsible>
      <Collapsible
        trigger={
          <Text type="label" weight="semibold">
            {t('editLogoTitle')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <LogoTools value={editing ?? {}} disabled={disabled} onChange={update} />
      </Collapsible>
    </VStack>
  );
}

function WholeVideoClip() {
  const { t } = useTranslation();
  const editor = useEditor();
  const editing = editor.processing?.editing;
  const trim = editing?.trim ?? { start_ms: 0, end_ms: editor.duration };
  const disabled = editor.opening || editor.busy;
  let outputDuration: number | undefined;
  try {
    outputDuration = resolveEditWindow(editing, editor.duration).duration_ms;
  } catch {}
  function update(patch: Partial<EditingRecipe>) {
    const next: EditingRecipe = { ...editing, ...patch };
    for (const key of Object.keys(next) as (keyof EditingRecipe)[]) {
      if (next[key] === undefined) delete next[key];
    }
    const recipe: ProcessingRecipe = { ...editor.processing, editing: next };
    if (!Object.keys(next).length) delete recipe.editing;
    editor.changeProcessing(Object.keys(recipe).length > 0 ? recipe : undefined);
  }
  return (
    <VStack gap={3}>
      <CheckboxInput
        label={t('editTrim')}
        value={Boolean(editing?.trim)}
        isDisabled={disabled}
        onChange={(enabled) => update({ trim: enabled ? trim : undefined })}
      />
      {editing?.trim && (
        <FormLayout direction="vertical">
          <NumberInput
            label={t('editTrimStart')}
            value={trim.start_ms / 1000}
            min={0}
            max={editor.duration / 1000}
            step={0.1}
            width={160}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(value) =>
              update({ trim: { ...trim, start_ms: Math.round(value * 1000) } as TimeRange })
            }
          />
          <NumberInput
            label={t('editTrimEnd')}
            value={trim.end_ms / 1000}
            min={0}
            max={editor.duration / 1000}
            step={0.1}
            width={160}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(value) =>
              update({ trim: { ...trim, end_ms: Math.round(value * 1000) } as TimeRange })
            }
          />
        </FormLayout>
      )}
      <NumberInput
        label={t('compositionSpeed')}
        value={editing?.speed ?? 1}
        min={0.25}
        max={4}
        step={0.05}
        width={160}
        isWheelEnabled={false}
        isDisabled={disabled}
        onChange={(speed) => update({ speed })}
      />
      <Text type="body" role="status">
        {outputDuration === undefined
          ? t('editRangeInvalid')
          : t('editDuration', { seconds: (outputDuration / 1000).toFixed(3) })}
      </Text>
    </VStack>
  );
}
