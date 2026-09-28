import { NumberInput } from '@astryxdesign/core/NumberInput';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe, TimeRange } from '../../../../core/editing/edit-recipe';
import { clampEditing, resolveEditWindow } from '../../../../core/editing/edit-recipe';
import type { ProcessingRecipe } from '../../../../core/processing/recipe';
import { PanelPair, PanelRows, PanelSection, PanelSections } from '../../../design-system/Panel';
import { useEditor } from '../EditorContext';
import { FadeSection } from '../video-tools/FadeTools';
import { LogoSection } from '../video-tools/LogoTools';
import { ColorSection, CropSection, FrameSection, SpeedSection } from '../video-tools/VideoTools';
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

/** Video: the clip — its frame, trim, speed and overlays, then the composition's clips. */
export function ClipsPanel() {
  const editor = useEditor();
  const update = useEditingUpdate();
  const disabled = editor.opening || editor.busy;
  const value = editor.processing?.editing ?? {};
  return (
    <PanelSections>
      <FrameSection value={value} disabled={disabled} onChange={update} />
      {/* The output edit window stays visible in composition mode; clearing it is the user's call. */}
      <TrimSection />
      <SpeedSection
        value={value}
        disabled={disabled}
        onChange={update}
        outputMs={outputMs(value, editor.duration)}
      />
      <CropSection value={value} disabled={disabled} onChange={update} />
      <ColorSection value={value} disabled={disabled} onChange={update} />
      <FadeSection value={value} disabled={disabled} onChange={update} />
      <LogoSection value={value} disabled={disabled} onChange={update} />
      {editor.composition && <CompositionPanel />}
    </PanelSections>
  );
}

function TrimSection() {
  const { t } = useTranslation();
  const editor = useEditor();
  const update = useEditingUpdate();
  const editing = editor.processing?.editing;
  const trim = editing?.trim ?? { start_ms: 0, end_ms: editor.duration };
  const disabled = editor.opening || editor.busy;
  let valid = true;
  try {
    resolveEditWindow(editing, editor.duration);
  } catch {
    valid = false;
  }
  return (
    <PanelSection
      title={t('editTrim')}
      isOn={Boolean(editing?.trim)}
      isDisabled={disabled}
      onToggle={(on) => update({ trim: on ? trim : undefined })}
    >
      <PanelRows>
        <PanelPair label={t('editTrimRange')}>
          <NumberInput
            label={t('editTrimStart')}
            isLabelHidden
            units="s"
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
            isLabelHidden
            units="s"
            value={trim.end_ms / 1000}
            min={0}
            max={editor.duration / 1000}
            step={0.1}
            isWheelEnabled={false}
            isDisabled={disabled}
            status={valid ? undefined : { type: 'error', message: t('editRangeInvalid') }}
            onChange={(value) =>
              update({ trim: { ...trim, end_ms: Math.round(value * 1000) } as TimeRange })
            }
          />
        </PanelPair>
      </PanelRows>
    </PanelSection>
  );
}

function outputMs(editing: EditingRecipe, duration: number): number | undefined {
  try {
    return resolveEditWindow(editing, duration).duration_ms;
  } catch {
    return undefined;
  }
}
