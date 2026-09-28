import { createContext, type ReactNode, useContext, useEffect } from 'react';
import type { RecentEntry } from '../../../core/projects/recent';
import { setDiagnosticProject } from '../../shell/diagnostics';
import { registerMenuCommand } from '../../shell/menuCommands';
import { refreshRecentItems } from '../projects/recent/useRecentItems';
import type { SettingsCategory } from '../settings/SettingsPanel';
import { type EditorSession, useEditorSession } from './useEditorSession';

function isRecentEntry(value: unknown): value is RecentEntry {
  return (
    value != null &&
    typeof value === 'object' &&
    ((value as RecentEntry).kind === 'video' || (value as RecentEntry).kind === 'project') &&
    typeof (value as RecentEntry).path === 'string'
  );
}

const EditorContext = createContext<EditorSession | null>(null);

export function EditorProvider({
  children,
  onDirty,
  onOpenSettings,
}: {
  children: ReactNode;
  onDirty: (dirty: boolean) => void;
  onOpenSettings: (tab?: SettingsCategory) => void;
}) {
  const editor = useEditorSession(onOpenSettings);
  useEffect(() => onDirty(editor.dirty), [editor.dirty, onDirty]);
  useEffect(() => {
    setDiagnosticProject(editor.documentId);
    return () => setDiagnosticProject(undefined);
  }, [editor.documentId]);

  useEffect(() => {
    void refreshRecentItems();
    return window.reupmatic.onRecentChanged(() => void refreshRecentItems());
  }, []);

  const locked = editor.busy || editor.savingProject || editor.opening;
  useEffect(() => {
    const offs = [
      registerMenuCommand('editor.openProject', () => {
        if (!locked) void editor.openProject().catch(() => undefined);
      }),
      registerMenuCommand('editor.newProject', () => {
        if (!locked) void editor.newProject().catch(() => undefined);
      }),
      registerMenuCommand('editor.openRecentItem', (data) => {
        if (locked || !isRecentEntry(data)) return;
        if (data.kind === 'video') void editor.openPath(data.path).catch(() => undefined);
        else void editor.openProjectPath(data.path).catch(() => undefined);
      }),
      registerMenuCommand('editor.saveProject', () => {
        if (editor.media && !editor.savingProject && !editor.opening)
          void editor.saveCurrentProject().catch(() => undefined);
      }),
      registerMenuCommand('editor.saveProjectAs', () => {
        if (editor.media && !editor.savingProject && !editor.opening)
          void editor.saveProjectAs().catch(() => undefined);
      }),
      registerMenuCommand('editor.importMedia', () => {
        if (!locked) void editor.importMedia().catch(() => undefined);
      }),
      registerMenuCommand('editor.undo', () => editor.undo()),
      registerMenuCommand('editor.redo', () => editor.redo()),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [locked, editor]);

  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('Editor components require EditorProvider');
  return editor;
}
