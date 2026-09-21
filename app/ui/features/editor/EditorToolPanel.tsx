import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import { SpeechSetup } from '../speech/SpeechGenerator';
import { TranslateSetup } from '../speech/translation/TranslateGenerator';
import { OcrSetup } from '../vision/OcrExtractGenerator';
import { VisionPanel } from '../vision/VisionPanel';
import { AudioPanel } from './audio-tools/AudioPanel';
import { VoicePanel } from './audio-tools/VoicePanel';
import { ClipsPanel } from './composition/ClipsPanel';
import { useEditor } from './EditorContext';
import { EditorSidePanel } from './EditorSidePanel';
import { TOOL_LABEL_KEY, type ToolId, useEditorTools } from './EditorToolContext';
import { SubtitleStylesPanel } from './subtitle-styles/SubtitleStylesPanel';

export function EditorToolPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { activeTool } = useEditorTools();
  if (!activeTool) return null;
  return (
    <EditorSidePanel
      id={`panel-${activeTool}`}
      tabId={`tab-${activeTool}`}
      title={t(TOOL_LABEL_KEY[activeTool])}
      onClose={onClose}
      className="editor-tool-panel"
    >
      <ToolPanelContent activeTool={activeTool} />
    </EditorSidePanel>
  );
}

function ToolPanelContent({ activeTool }: { activeTool: ToolId }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const media = editor.media;
  switch (activeTool) {
    case 'transcribe':
      return <TranscribePanel />;
    case 'translate':
      return <TranslatePanel />;
    case 'voice':
      return <VoicePanel />;
    case 'style':
      return media ? <SubtitleStylesPanel key={`styles-${media.asset_id}`} /> : null;
    case 'clean-up':
      return !media ? null : editor.composition ? (
        <Text as="p" type="body" className="notice">
          {t('compositionAiUnavailable')}
        </Text>
      ) : (
        <VisionPanel
          key={media.asset_id}
          assetId={media.asset_id}
          revision={editor.revision}
          start={editor.sampleStart}
          end={editor.sampleEnd}
          duration={media.duration_ms}
        />
      );
    case 'audio':
      return media ? <AudioPanel key={`audio-${media.asset_id}`} /> : null;
    case 'edit':
      return media ? <ClipsPanel key={editor.documentId} /> : null;
  }
}

function TranscribePanel() {
  return (
    <>
      <SpeechSetup />
      <OcrSetup />
    </>
  );
}

function TranslatePanel() {
  return <TranslateSetup />;
}
