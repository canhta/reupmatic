import type { ResizableRegion } from '@astryxdesign/core/Resizable';
import { ResizeHandle } from '@astryxdesign/core/Resizable';
import { useTranslation } from 'react-i18next';
import { CuePanel } from './CuePanel';
import { EditorSidePanel } from './EditorSidePanel';
import { SOURCE_LABEL_KEY, useEditorSources } from './EditorSourceContext';
import { EditorToolPanel } from './EditorToolPanel';
import { ProjectMediaSection } from './ProjectMediaSection';

const SOURCE_DEFAULT_WIDTH = 330;
const TOOL_PANEL_DEFAULT_WIDTH = 300;

export function EditorSourceRegion({ region }: { region: ResizableRegion }) {
  const { t } = useTranslation();
  const { activeSource, collapseSource } = useEditorSources();
  if (!activeSource) return null;
  return (
    <div className="editor-source-region" style={{ width: region.size }}>
      <EditorSidePanel
        id={`panel-${activeSource}`}
        tabId={`tab-${activeSource}`}
        title={t(SOURCE_LABEL_KEY[activeSource])}
        onClose={collapseSource}
      >
        {activeSource === 'media' ? <ProjectMediaSection /> : <CuePanel />}
      </EditorSidePanel>
    </div>
  );
}

export function EditorToolPanelRegion({
  region,
  isWide,
  onClose,
}: {
  region: ResizableRegion;
  isWide: boolean;
  onClose: () => void;
}) {
  return (
    <div className="editor-tool-panel-region" style={isWide ? { width: region.size } : undefined}>
      <EditorToolPanel onClose={onClose} />
    </div>
  );
}

export function EditorRegionHandle({
  region,
  direction,
  isReversed,
  label,
  defaultSize,
}: {
  region: ResizableRegion;
  direction: 'horizontal' | 'vertical';
  isReversed?: boolean;
  label: string;
  defaultSize: number;
}) {
  return (
    <ResizeHandle
      resizable={region.props}
      direction={direction}
      isReversed={isReversed}
      hasDivider
      label={label}
      onDoubleClick={() => region.resize(defaultSize)}
    />
  );
}

export const REGION_DEFAULTS = {
  source: SOURCE_DEFAULT_WIDTH,
  toolPanel: TOOL_PANEL_DEFAULT_WIDTH,
};
