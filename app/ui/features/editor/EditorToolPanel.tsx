import { Divider } from '@astryxdesign/core/Divider';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { SidePanel } from '../../design-system/SidePanel';
import { SpeechSetup } from '../speech/SpeechGenerator';
import { TranslateSetup } from '../speech/translation/TranslateGenerator';
import { OcrSetup } from '../vision/OcrExtractGenerator';
import { AudioPanel } from './audio-tools/AudioPanel';
import { VoicePanel } from './audio-tools/VoicePanel';
import { ClipsPanel } from './composition/ClipsPanel';
import { useEditor } from './EditorContext';
import { TOOL_LABEL_KEY, type ToolId, useEditorTools } from './EditorToolContext';
import { SubtitleStylesPanel } from './subtitle-styles/SubtitleStylesPanel';

export function EditorToolPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { activeTool } = useEditorTools();
  if (!activeTool) return null;
  return (
    <SidePanel
      id={`panel-${activeTool}`}
      tabId={`tab-${activeTool}`}
      label={t(TOOL_LABEL_KEY[activeTool])}
      onClose={onClose}
      className="editor-tool-panel"
    >
      <ToolPanelContent activeTool={activeTool} />
    </SidePanel>
  );
}

function ToolPanelContent({ activeTool }: { activeTool: ToolId }) {
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
    case 'audio':
      return media ? <AudioPanel key={`audio-${media.asset_id}`} /> : null;
    case 'edit':
      return media ? <ClipsPanel key={editor.documentId} /> : null;
  }
}

function TranscribePanel() {
  return (
    <VStack gap={5}>
      <SpeechSetup />
      <Divider />
      <OcrSetup />
    </VStack>
  );
}

function TranslatePanel() {
  return <TranslateSetup />;
}
