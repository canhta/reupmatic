import { Captions, Film } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { EditorRail, type RailItem } from './EditorRail';
import {
  SOURCE_LABEL_KEY,
  SOURCE_ORDER,
  type SourceId,
  useEditorSources,
} from './EditorSourceContext';

const SOURCE_ICON: Record<SourceId, ComponentType<SVGProps<SVGSVGElement>>> = {
  media: Film,
  cues: Captions,
};

/**
 * The source rail at the Editor's left edge (D-63, owner): the same
 * rail as the right edge's, with the project's two inputs — Media and Subtitles.
 * It never collapses and never disables: adding media is what an empty project
 * starts with.
 */
export function EditorSourceRail() {
  const { t } = useTranslation();
  const { activeSource, selectSource, collapseSource } = useEditorSources();
  const items: RailItem<SourceId>[] = SOURCE_ORDER.map((id) => ({
    id,
    label: t(SOURCE_LABEL_KEY[id]),
    icon: SOURCE_ICON[id],
  }));
  return (
    <EditorRail
      items={items}
      activeId={activeSource}
      label={t('sourceRailLabel')}
      panelId={activeSource ? `panel-${activeSource}` : null}
      onSelect={selectSource}
      onCollapse={collapseSource}
      className="editor-source-rail"
      tooltipPlacement="end"
    />
  );
}
