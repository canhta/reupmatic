import { AudioLines, Eraser, Languages, Mic, Music, Palette, Scissors } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from './EditorContext';
import { EditorRail, type RailItem } from './EditorRail';
import { TOOL_LABEL_KEY, TOOL_ORDER, type ToolId, useEditorTools } from './EditorToolContext';

const TOOL_ICON: Record<ToolId, ComponentType<SVGProps<SVGSVGElement>>> = {
  transcribe: Mic,
  translate: Languages,
  voice: AudioLines,
  style: Palette,
  'clean-up': Eraser,
  audio: Music,
  edit: Scissors,
};

/**
 * The fixed tool rail at the Editor's right edge (D-63/ED-P01): five core items
 * in workflow order, a rule, then Audio and Edit. Seven is a ceiling and the set
 * never changes with selection; a later capability goes inside an existing item
 * rather than becoming an eighth entry. The rail itself never collapses.
 */
export function EditorToolRail() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { activeTool, selectTool, collapseTool } = useEditorTools();
  const items: RailItem<ToolId>[] = TOOL_ORDER.map((id, index) => ({
    id,
    label: t(TOOL_LABEL_KEY[id]),
    icon: TOOL_ICON[id],
    hasRuleBefore: index === 5,
  }));
  return (
    <EditorRail
      items={items}
      activeId={activeTool}
      isDisabled={!editor.media}
      label={t('toolRailLabel')}
      panelId={activeTool ? `panel-${activeTool}` : null}
      onSelect={selectTool}
      onCollapse={collapseTool}
      className="editor-tool-rail"
      tooltipPlacement="start"
    />
  );
}
