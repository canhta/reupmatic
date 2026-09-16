import type { ProcessingRecipe } from '../../../../core/processing/recipe';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Button } from '@astryxdesign/core/Button';
import { useTranslation } from 'react-i18next';
import { resolveEditWindow, type TimeRange } from '../../../../core/editing/edit-recipe';
import { useEditor } from '../EditorContext';

export function TrimControls() {
  const editor = useEditor();
  const { t } = useTranslation();
  if (!editor.media) return null;
  const editing = editor.processing?.editing;
  const trim = editing?.trim ?? { start_ms: 0, end_ms: editor.duration };
  const disabled = editor.opening || editor.busy;
  let outputDuration: number | undefined;
  try { outputDuration = resolveEditWindow(editing, editor.duration).duration_ms; }
  catch { /* Invalid edits remain visible for correction; rendering validates them. */ }
  function update(range?: TimeRange) {
    const next = { ...editing, trim: range };
    if (!range) delete next.trim;
    const recipe: ProcessingRecipe = { ...editor.processing, version: 1 as const, editing: next };
    if (!Object.keys(next).length) delete recipe.editing;
    editor.changeProcessing(Object.keys(recipe).length > 1 ? recipe : undefined);
  }
  return <div className="business-form">
    <CheckboxInput label={t(editor.composition ? 'compositionTrim' : 'editTrim')} value={Boolean(editing?.trim)} isDisabled={disabled}
      onChange={enabled => update(enabled ? trim : undefined)} />
    {editing?.trim && <div className="business-toolbar">
      <NumberInput label={t('editTrimStart')} value={trim.start_ms / 1000} min={0}
        max={editor.duration / 1000} step={0.1} width={180} isWheelEnabled={false} isDisabled={disabled}
        onChange={value => update({ ...trim, start_ms: Math.round(value * 1000) })} />
      <NumberInput label={t('editTrimEnd')} value={trim.end_ms / 1000} min={0}
        max={editor.duration / 1000} step={0.1} width={180} isWheelEnabled={false} isDisabled={disabled}
        onChange={value => update({ ...trim, end_ms: Math.round(value * 1000) })} />
      <Button label={t('editMarkIn')} isDisabled={disabled} onClick={() => update({ ...trim, start_ms: editor.clock })} />
      <Button label={t('editMarkOut')} isDisabled={disabled} onClick={() => update({ ...trim, end_ms: editor.clock })} />
    </div>}
    <p className="field-help">{t(editor.composition ? 'compositionClock' : 'editSourceTimeHint')}</p>
    <span role="status">{outputDuration === undefined ? t('editRangeInvalid')
      : t('editDuration', { seconds: (outputDuration / 1000).toFixed(3) })}</span>
  </div>;
}
