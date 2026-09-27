import { createContext, type ReactNode, useContext, useState } from 'react';
import { getTextLayer } from '../../../core/subtitles/layers/document';
import { useSynthesisJob } from '../speech/synthesis/useSynthesisJob';
import { useTranslationJob } from '../speech/translation/useTranslationJob';
import { useSpeechJob } from '../speech/useSpeechJob';
import { useVisionJob } from '../vision/useVisionJob';
import { useEditor } from './EditorContext';

type SpeechJob = ReturnType<typeof useSpeechJob>;
type VisionJob = ReturnType<typeof useVisionJob>;
type TranslationJob = ReturnType<typeof useTranslationJob>;
type SynthesisJob = ReturnType<typeof useSynthesisJob>;

export type GeneratorKind = 'speech' | 'ocr' | 'translate';

export interface EditorGenerators {
  speech: SpeechJob;
  vision: VisionJob;
  translation: TranslationJob;
  synthesis: SynthesisJob;
  review: GeneratorKind | null;
  showReview: (kind: GeneratorKind) => void;
}

const EditorGeneratorsContext = createContext<EditorGenerators | null>(null);

export function EditorGeneratorsProvider({ children }: { children: ReactNode }) {
  const editor = useEditor();
  const media = editor.media;
  const speech = useSpeechJob({
    documentId: editor.documentId,
    assetId: media?.asset_id ?? '',
    revision: editor.revision,
    duration: media?.duration_ms ?? 0,
    hasAudio: Boolean(media?.has_audio),
    composed: Boolean(editor.composition),
    targetCues: JSON.stringify(getTextLayer(editor.textSnapshot, 'transcript').cues),
  });
  const vision = useVisionJob({
    assetId: media?.asset_id ?? '',
    revision: editor.revision,
    duration: media?.duration_ms ?? 0,
  });
  const translation = useTranslationJob({
    documentId: editor.documentId,
    revision: editor.revision,
    snapshot: editor.textSnapshot,
    opening: editor.opening,
  });
  // Lifted here, not in the Voice panel: switching tools must not cancel a running job or drop
  // its draft.
  const synthesis = useSynthesisJob({
    documentId: editor.documentId,
    revision: editor.revision,
    snapshot: editor.textSnapshot,
    opening: editor.opening,
  });
  const [started, setStarted] = useState<GeneratorKind | null>(null);
  const drafts: Record<GeneratorKind, unknown> = {
    speech: speech.draft,
    ocr: vision.draft,
    translate: translation.draft,
  };
  const review: GeneratorKind | null =
    (started && drafts[started] ? started : null) ??
    (drafts.speech ? 'speech' : drafts.ocr ? 'ocr' : drafts.translate ? 'translate' : null);
  return (
    <EditorGeneratorsContext.Provider
      value={{ speech, vision, translation, synthesis, review, showReview: setStarted }}
    >
      {children}
    </EditorGeneratorsContext.Provider>
  );
}

export function useEditorGenerators() {
  const generators = useContext(EditorGeneratorsContext);
  if (!generators) throw new Error('Editor generator components require EditorGeneratorsProvider');
  return generators;
}
