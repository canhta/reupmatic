import type { ResizableRegion } from '@astryxdesign/core/Resizable';
import { ResizeHandle } from '@astryxdesign/core/Resizable';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { SidePanel } from '../../design-system/SidePanel';
import { CuePanel } from './CuePanel';
import { SOURCE_LABEL_KEY, useEditorSources } from './EditorSourceContext';
import { EditorToolPanel } from './EditorToolPanel';
import { ProjectMediaSection } from './ProjectMediaSection';

const SOURCE_DEFAULT_WIDTH = 330;
const TOOL_PANEL_DEFAULT_WIDTH = 360;

export function EditorSourceRegion({ region }: { region: ResizableRegion }) {
  const { t } = useTranslation();
  const { activeSource, collapseSource } = useEditorSources();
  if (!activeSource) return null;
  return (
    <VStack className="editor-source-region" width={region.size}>
      <SidePanel
        id={`panel-${activeSource}`}
        tabId={`tab-${activeSource}`}
        label={t(SOURCE_LABEL_KEY[activeSource])}
        onClose={collapseSource}
      >
        {activeSource === 'media' ? <ProjectMediaSection /> : <CuePanel />}
      </SidePanel>
    </VStack>
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
    <VStack className="editor-tool-panel-region" width={isWide ? region.size : undefined}>
      <EditorToolPanel onClose={onClose} />
    </VStack>
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
