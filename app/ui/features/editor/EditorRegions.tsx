import type { ResizableRegion } from '@astryxdesign/core/Resizable';
import { ResizeHandle } from '@astryxdesign/core/Resizable';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { CaptionsDrawer } from './captions/CaptionsDrawer';
import { SOURCE_LABEL_KEY, useEditorSources } from './EditorSourceContext';
import { EditorToolPanel } from './EditorToolPanel';
import { ProjectMediaSection } from './ProjectMediaSection';
import { ToolDrawer } from './ToolDrawer';

const SOURCE_DEFAULT_WIDTH = 320;
const TOOL_PANEL_DEFAULT_WIDTH = 320;

export function EditorSourceRegion({ region }: { region: ResizableRegion }) {
  const { t } = useTranslation();
  const { activeSource, collapseSource } = useEditorSources();
  if (!activeSource) return null;
  return (
    <VStack className="editor-source-region" width={region.size}>
      {activeSource === 'media' ? (
        <ToolDrawer
          id="panel-media"
          tabId="tab-media"
          label={t(SOURCE_LABEL_KEY.media)}
          onClose={collapseSource}
        >
          <ProjectMediaSection />
        </ToolDrawer>
      ) : (
        <CaptionsDrawer onClose={collapseSource} />
      )}
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
