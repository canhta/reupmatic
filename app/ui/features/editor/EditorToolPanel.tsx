import { useTranslation } from 'react-i18next';
import { AudioPanel } from './audio-tools/AudioPanel';
import { ClipsPanel } from './composition/ClipsPanel';
import { useEditor } from './EditorContext';
import { TOOL_LABEL_KEY, type ToolId, useEditorTools } from './EditorToolContext';
import { SubtitleStylesPanel } from './subtitle-styles/SubtitleStylesPanel';
import { ToolDrawer } from './ToolDrawer';

export function EditorToolPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { activeTool } = useEditorTools();
  if (!activeTool) return null;
  return (
    <ToolDrawer
      id={`panel-${activeTool}`}
      tabId={`tab-${activeTool}`}
      label={t(TOOL_LABEL_KEY[activeTool])}
      className="editor-tool-panel"
      onClose={onClose}
    >
      <ToolPanelContent activeTool={activeTool} />
    </ToolDrawer>
  );
}

function ToolPanelContent({ activeTool }: { activeTool: ToolId }) {
  const editor = useEditor();
  const media = editor.media;
  switch (activeTool) {
    case 'text':
      return media ? <SubtitleStylesPanel key={`styles-${media.asset_id}`} /> : null;
    case 'audio':
      return media ? <AudioPanel key={`audio-${media.asset_id}`} /> : null;
    case 'video':
      return media ? <ClipsPanel key={editor.documentId} /> : null;
  }
}
