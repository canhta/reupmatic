import type { EditingRecipe } from '../../../core/editing/edit-recipe';
import { PanelSections } from '../../design-system/Panel';
import { OriginalSection } from '../editor/audio-tools/AudioTools';
import { FadeSection } from '../editor/video-tools/FadeTools';
import {
  ColorSection,
  CropSection,
  FrameSection,
  SpeedSection,
} from '../editor/video-tools/VideoTools';

/** The recipe's video and audio edits, as the Editor's own sections. */
export function EditingOptions({
  value = {},
  disabled,
  onChange,
}: {
  value?: EditingRecipe;
  disabled: boolean;
  onChange(value: EditingRecipe | undefined): void;
}) {
  function update(patch: Partial<EditingRecipe>) {
    const next = { ...value, ...patch };
    for (const key of Object.keys(next) as (keyof EditingRecipe)[]) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(Object.keys(next).length ? next : undefined);
  }
  const props = { value, disabled, onChange: update };
  return (
    <PanelSections>
      <FrameSection {...props} />
      <SpeedSection {...props} />
      <CropSection {...props} />
      <ColorSection {...props} />
      <FadeSection {...props} />
      <OriginalSection {...props} />
    </PanelSections>
  );
}
