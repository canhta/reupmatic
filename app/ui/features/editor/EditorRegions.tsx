import type { ResizableRegion } from '@astryxdesign/core/Resizable';
import { ResizeHandle } from '@astryxdesign/core/Resizable';
import { useTranslation } from 'react-i18next';
import { CuePanel } from './CuePanel';
import { EditorSidePanel } from './EditorSidePanel';
import { SOURCE_LABEL_KEY, useEditorSources } from './EditorSourceContext';
import { EditorToolPanel } from './EditorToolPanel';
import { ProjectMediaSection } from './ProjectMediaSection';

// Three resizable seams (source panel↔viewer, viewer↔tool panel,
// top↔timeline), each collapsible, persisted per user via useResizable's own
// `autoSaveId` (localStorage), keyboard-accessible via ResizeHandle's own
// arrow-key handling, and reset on a double-click of the handle. These
// components are the stable slots the content lane fills: CuePanel and the tool
// panel's own internals stay untouched — this file owns only the chrome around
// them (panel shell, resize handle, collapse), never their content.

// At 1420×900 (≈1210px content width): source panel ≈26% (≈320px), viewer ≈50%
// (the flex remainder, never an explicit size), tool panel ≈24% (≈290px) — the
// source panel is never narrower than the tool panel (the old 280/380 pair
// inverted that, truncating the cue list's own search field and layer/language
// selectors to fit a panel sized only for its tab strip).
const SOURCE_DEFAULT_WIDTH = 330;
const TOOL_PANEL_DEFAULT_WIDTH = 300;

/**
 * The left column: one panel per source rail item (D-63, owner).
 * Dragging its seam past the collapse threshold closes it to the rail, exactly
 * as clicking the open rail item does; the rail itself always stays.
 */
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

/**
 * The tool panel's resizable column. One tree at every width: at wide widths
 * the wrapper carries the persisted width, below 1200px editor.css turns it
 * into `display: contents` and the panel becomes the overlay drawer. Because
 * both layouts render this same wrapper around the same child, the panel never
 * remounts when the window crosses the breakpoint, so the open item and its
 * state survive (EditorWorkspace keeps the rail and this region in fixed slots).
 */
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
      // Double-click resets to the default size rather than the
      // last-dragged one.
      onDoubleClick={() => region.resize(defaultSize)}
    />
  );
}

export const REGION_DEFAULTS = {
  source: SOURCE_DEFAULT_WIDTH,
  toolPanel: TOOL_PANEL_DEFAULT_WIDTH,
};
