import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../features/editor/EditorContext';
import type { WorkspaceArea } from './WorkspaceNavigation';

export function WindowTitleSync({ area }: { area: WorkspaceArea }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const mediaName = area === 'editor' ? editor.media?.name : undefined;

  useEffect(() => {
    document.title = mediaName || t(area);
  }, [area, mediaName, t]);

  return null;
}
