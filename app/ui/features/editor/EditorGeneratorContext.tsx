import { createContext, type ReactNode, useContext, useState } from 'react';
import { useTranslationJob } from '../speech/translation/useTranslationJob';
import { useSpeechJob } from '../speech/useSpeechJob';
import { useVisionJob } from '../vision/useVisionJob';
import { useEditor } from './EditorContext';

type SpeechJob = ReturnType<typeof useSpeechJob>;
type VisionJob = ReturnType<typeof useVisionJob>;
type TranslationJob = ReturnType<typeof useTranslationJob>;

/** The three generator flows a Transcribe/Translate panel can run. */
export type GeneratorKind = 'speech' | 'ocr' | 'translate';

export interface EditorGenerators {
  speech: SpeechJob;
  vision: VisionJob;
  translation: TranslationJob;
  /** The result review the cue column shows, if any. */
  review: GeneratorKind | null;
  /** The setup form calls this when it starts a run, so the cue column shows
   * that capability's review rather than an earlier unconsumed one. */
  showReview: (kind: GeneratorKind) => void;
}

const EditorGeneratorsContext = createContext<EditorGenerators | null>(null);

/**
 * The three recognition/translation jobs the Transcribe and Translate panels
 * set up (ED-P01, ticket 02). They live above both the tool panel — where the
 * setup form runs them — and the cue column, where `CuePanel` renders the
 * review once a draft lands, so a run started in the panel is the same job
 * whose draft replaces the list. Mounting them here rather than inside each
 * generator keeps one job per capability instead of a panel copy and a
 * cue-column copy that could disagree.
 */
export function EditorGeneratorsProvider({ children }: { children: ReactNode }) {
  const editor = useEditor();
  const media = editor.media;
  const speech = useSpeechJob({
    documentId: editor.documentId,
    assetId: media?.asset_id ?? '',
    revision: editor.revision,
    duration: media?.duration_ms ?? 0,
    start: editor.sampleStart,
    end: editor.sampleEnd,
    hasAudio: Boolean(media?.has_audio),
    composed: Boolean(editor.composition),
  });
  const vision = useVisionJob({
    assetId: media?.asset_id ?? '',
    revision: editor.revision,
    start: editor.sampleStart,
    end: editor.sampleEnd,
    duration: media?.duration_ms ?? 0,
  });
  const translation = useTranslationJob({
    documentId: editor.documentId,
    revision: editor.revision,
    snapshot: editor.textSnapshot,
    opening: editor.opening,
  });
  const [started, setStarted] = useState<GeneratorKind | null>(null);
  // The started capability wins while it still has a draft; otherwise any
  // draft present is shown, so a failed or consumed run never leaves the cue
  // column pointing at nothing.
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
      value={{ speech, vision, translation, review, showReview: setStarted }}
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
