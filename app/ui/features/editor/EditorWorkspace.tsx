import { SynthesisPanel } from '../speech/synthesis/SynthesisPanel';
import { TranslationPanel } from '../speech/translation/TranslationPanel';
import { SpeechPanel } from '../speech/SpeechPanel';
import { CompositionPanel } from './composition/CompositionPanel';
import { SoundtrackPanel } from './audio-tools/SoundtrackPanel';
import { SubtitleStylesPanel } from './subtitle-styles/SubtitleStylesPanel';
import { RecoveryPanel } from '../projects/recovery/RecoveryPanel';
import { editingErrors } from './video-tools/i18n';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ProfileManager } from '../profiles/ProfileManager';
import { processingErrorKey } from '../processing/i18n';
import { visionErrorKey } from '../vision/i18n';
import { useTranslation } from 'react-i18next';
import { canApplyOcr } from '../../../core/vision/ocr-draft';
import { VisionPanel } from '../vision/VisionPanel';
import { CuePanel } from './CuePanel';
import { useEditor } from './EditorContext';
import { MediaStage } from './MediaStage';
import { RenderControls } from './RenderControls';
import { TimelineStrip } from './TimelineStrip';
import { useMediaAdapters } from './useMediaAdapters';

const errorKeys: Record<string, string> = {
  INVALID_TEXT_LAYERS: 'textLayerInvalid', TEXT_LAYERS_TOO_LARGE: 'textLayerTooLarge',
  COMPOSITION_CUE_LIMIT: 'compositionCueLimit', COMPOSITION_DISK_LOW: 'compositionDiskLow',
  INVALID_COMPOSITION: 'compositionInvalid', COMPOSITION_UNAUTHORIZED: 'compositionInvalid',
  COMPOSITION_DURATION: 'compositionInvalid', COMPOSITION_CLIP_SHORT: 'compositionInvalid',
  COMPOSITION_SAMPLE_SHORT: 'compositionInvalid', COMPOSITION_JOIN: 'compositionInvalid',
  COMPOSITION_SPLIT: 'compositionInvalid', COMPOSITION_PROCESSING_UNAVAILABLE: 'compositionAiUnavailable',
  ...editingErrors, INVALID_SUBTITLE_STYLE: 'styleInvalid', INVALID_SOUNDTRACK: 'soundtrackInvalid',
  SOUNDTRACK_UNAUTHORIZED: 'soundtrackInvalid', NO_AUDIO: 'soundtrackInvalid',
  STALE_OPERATION: 'libraryStaleOpen', EDITOR_BUSY: 'libraryBusy',
  PROJECT_VERSION: 'projectVersionError', INVALID_PROJECT: 'projectError',
  PROJECT_TOO_LARGE: 'projectError', PROJECT_EXTENSION: 'projectError',
  COMPONENT_MISSING: 'componentError', INVALID_CUES: 'timingError', SPLIT_RANGE: 'splitError',
  SOURCE_CHANGED: 'sourceChanged', SOURCE_MISSING: 'sourceChanged',
  PREVIEW_UNAVAILABLE: 'previewError', CANCELLED: 'cancelled',
};

export function EditorWorkspace() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { media, cap, error, revision } = editor;
  const wave = useMediaAdapters();
  return (
    <div className="editor-workspace">
      <RecoveryPanel />
      {media && <small role="status">{editor.dirty ? t('projectUnsaved') : t('projectClean')}</small>}
      <Collapsible trigger={t('profilesTitle')} defaultIsOpen={false}>
        <ProfileManager currentRecipe={editor.processing} />
      </Collapsible>
      <div className="notice">{t('limited')}</div>
      {error && <div className="error" role="alert">
        {t(processingErrorKey(error) || errorKeys[error]
          || (error.startsWith('MODEL_') || error.startsWith('VISION_') ? visionErrorKey(error) : 'failed'))} <code>{error}</code>
      </div>}
      {cap && !cap.pysubs2 && <div className="warning">{t('missing')}</div>}
      {!media ? <div className="empty">{t('empty')}</div> : <>
        <section className="editor"><MediaStage /><CuePanel /></section>
        <CompositionPanel key={editor.documentId} />
        <TimelineStrip wave={wave} />
        <SubtitleStylesPanel key={`styles-${media.asset_id}`} />
        <SoundtrackPanel key={`audio-${media.asset_id}`} />
        <RenderControls />
        <SynthesisPanel key={`synthesis-${editor.documentId}`} />
        <TranslationPanel key={`translation-${editor.documentId}`} />
        <SpeechPanel key={`speech-${editor.documentId}`} />
        {editor.composition ? <p className="notice">{t('compositionAiUnavailable')}</p> : <VisionPanel key={media.asset_id} assetId={media.asset_id} revision={revision}
          start={editor.sampleStart} end={editor.sampleEnd} duration={media.duration_ms}
          onApply={(result, captured) => {
            if (!canApplyOcr(result, captured, media.asset_id, editor.rev.current)) return false;
            return editor.applyOcr(result, captured);
          }} />}
      </>}
    </div>
  );
}
