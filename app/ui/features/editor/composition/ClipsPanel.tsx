import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { Grid } from '@astryxdesign/core/Grid';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe, TimeRange } from '../../../../core/editing/edit-recipe';
import { clampEditing, resolveEditWindow } from '../../../../core/editing/edit-recipe';
import type { ProcessingRecipe } from '../../../../core/processing/recipe';
import { useEditor } from '../EditorContext';
import { FadeTools } from '../video-tools/FadeTools';
import { LogoTools } from '../video-tools/LogoTools';
import { VideoTools } from '../video-tools/VideoTools';
import { CompositionPanel } from './CompositionPanel';

function useEditingUpdate() {
  const editor = useEditor();
  return (patch: Partial<EditingRecipe>) => {
    const editing = editor.processing?.editing;
    const next = clampEditing({ ...editing, ...patch }, editor.duration);
    for (const key of Object.keys(next) as (keyof EditingRecipe)[]) {
      if (next[key] === undefined) delete next[key];
    }
    const recipe: ProcessingRecipe = { ...editor.processing, editing: next };
    if (!Object.keys(next).length) delete recipe.editing;
    editor.changeProcessing(Object.keys(recipe).length > 0 ? recipe : undefined);
  };
}

export function ClipsPanel() {
  const editor = useEditor();
  const disabled = editor.opening || editor.busy;
  return (
    <VStack gap={5}>
      {editor.composition && <CompositionPanel />}
      {/* The output edit window stays visible in composition mode; clearing it is the user's call. */}
      <WholeVideoClip />
      <GlobalEditSections disabled={disabled} />
    </VStack>
  );
}

function GlobalEditSections({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const update = useEditingUpdate();
  return (
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
          value={editor.processing?.editing ?? {}}
          disabled={disabled}
          onChange={update}
          toggle={Switch}
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
          value={editor.processing?.editing ?? {}}
          disabled={disabled}
          onChange={update}
          toggle={Switch}
        />
      </Collapsible>
      <Collapsible
        value="logo"
        trigger={
          <Text type="body" weight="semibold">
            {t('editLogoTitle')}
          </Text>
        }
        defaultIsOpen={false}
      >
        <LogoTools
          value={editor.processing?.editing ?? {}}
          disabled={disabled}
          onChange={update}
          toggle={Switch}
        />
      </Collapsible>
    </CollapsibleGroup>
  );
}

function WholeVideoClip() {
  const { t } = useTranslation();
  const editor = useEditor();
  const update = useEditingUpdate();
  const editing = editor.processing?.editing;
  const trim = editing?.trim ?? { start_ms: 0, end_ms: editor.duration };
  const disabled = editor.opening || editor.busy;
  let outputDuration: number | undefined;
  try {
    outputDuration = resolveEditWindow(editing, editor.duration).duration_ms;
  } catch {}
  return (
    <VStack gap={3}>
      <Switch
        label={t('editTrim')}
        value={Boolean(editing?.trim)}
        isDisabled={disabled}
        onChange={(enabled) => update({ trim: enabled ? trim : undefined })}
      />
      {editing?.trim && (
        <Grid columns={2} gap={3}>
          <NumberInput
            label={t('editTrimStart')}
            units="s"
            width="100%"
            value={trim.start_ms / 1000}
            min={0}
            max={editor.duration / 1000}
            step={0.1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(value) =>
              update({ trim: { ...trim, start_ms: Math.round(value * 1000) } as TimeRange })
            }
          />
          <NumberInput
            label={t('editTrimEnd')}
            units="s"
            width="100%"
            value={trim.end_ms / 1000}
            min={0}
            max={editor.duration / 1000}
            step={0.1}
            isWheelEnabled={false}
            isDisabled={disabled}
            onChange={(value) =>
              update({ trim: { ...trim, end_ms: Math.round(value * 1000) } as TimeRange })
            }
          />
        </Grid>
      )}
      <NumberInput
        label={t('editSpeed')}
        units="×"
        width="100%"
        value={editing?.speed ?? 1}
        min={0.25}
        max={4}
        step={0.05}
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
