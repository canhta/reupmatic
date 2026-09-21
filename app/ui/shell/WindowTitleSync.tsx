import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '../features/editor/EditorContext';
import type { WorkspaceArea } from './WorkspaceNavigation';

// Keeps the OS window title (Cmd+Tab, Mission Control, Dock) aligned with
// what the in-app toolbar shows: the open document/video name when one
// exists, otherwise the current area name. Never the bare app name — that
// tells a user nothing once more than one window or space is in play.
export function WindowTitleSync({ area }: { area: WorkspaceArea }) {
  const { t } = useTranslation();
  const editor = useEditor();
  const mediaName = area === 'editor' ? editor.media?.name : undefined;

  useEffect(() => {
    document.title = mediaName || t(area);
  }, [area, mediaName, t]);

  return null;
}
