import type { EditingRecipe } from '../../../../core/editing/edit-recipe';
import { PanelSections } from '../../../design-system/Panel';
import { VoiceoverSection } from '../../speech/synthesis/SynthesisPanel';
import { useEditor } from '../EditorContext';
import { OriginalSection } from './AudioTools';
import { DuckingSection, MusicSection } from './SoundtrackPanel';

/** Audio: everything the viewer hears — the original, the voiceover and the music. */
export function AudioPanel() {
  const editor = useEditor();
  const editing = editor.processing?.editing;
  return (
    <PanelSections>
      <OriginalSection
        value={editing ?? {}}
        disabled={editor.opening || editor.busy}
        onChange={(patch: Partial<EditingRecipe>) =>
          editor.changeProcessing({ ...editor.processing, editing: { ...editing, ...patch } })
        }
      />
      <VoiceoverSection />
      <MusicSection />
      {editor.soundtrack && <DuckingSection />}
    </PanelSections>
  );
}
