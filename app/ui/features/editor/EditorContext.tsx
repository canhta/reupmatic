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
  /** Navigates App.tsx's own `area`/`settingsCategory` state to the Settings destination (D-57);
   * threaded down rather than reached through `window.reupmatic` since this is now a pure
   * in-renderer navigation, not a host round trip. */
  onOpenSettings: (tab?: SettingsCategory) => void;
}) {
  const editor = useEditorSession(onOpenSettings);
  useEffect(() => onDirty(editor.dirty), [editor.dirty, onDirty]);
  // Registers the open Project with the shell's diagnostic capture, the same way the dirty state
  // above is registered with its session lifecycle (D-61).
  useEffect(() => {
    setDiagnosticProject(editor.documentId);
    return () => setDiagnosticProject(undefined);
  }, [editor.documentId]);

  // The host records a Recent entry on every successful open (app/electron/features/editor/
  // ipc.ts) and pushes this event so the switcher's own list never goes stale after a native
  // File > Open Recent pick, which never touches this window's own operations directly.
  useEffect(() => {
    void refreshRecentItems();
    return window.reupmatic.onRecentChanged(() => void refreshRecentItems());
  }, []);

  // Native File-menu commands dispatch through these same
  // functions the Editor header's own buttons call. EditorHeader itself
  // unmounts when another area is active, so these live on the provider
  // (mounted for the app's whole lifetime) instead. A menu item has no
  // per-state disabled affordance the way EditorHeader's Button does, so a
  // busy/opening attempt is caught and quietly no-ops, matching what the
  // disabled button already prevented visibly.
  const locked = editor.busy || editor.savingProject || editor.opening;
  useEffect(() => {
    const offs = [
      registerMenuCommand('editor.openProject', () => {
        if (!locked) void editor.openProject().catch(() => undefined);
      }),
      registerMenuCommand('editor.newProject', () => {
        if (!locked) void editor.newProject().catch(() => undefined);
      }),
      // File > Open Recent's own submenu items (menu.ts) send the chosen entry straight through
      // — the same open-by-path calls the header switcher's Recent rows use, no dialog pair.
      registerMenuCommand('editor.openRecentItem', (data) => {
        if (locked || !isRecentEntry(data)) return;
        if (data.kind === 'video') void editor.openPath(data.path).catch(() => undefined);
        else void editor.openProjectPath(data.path).catch(() => undefined);
      }),
      registerMenuCommand('editor.saveProject', () => {
        if (editor.media && !editor.savingProject && !editor.opening)
          void editor.saveCurrentProject().catch(() => undefined);
      }),
      // Save As always picks a new destination; Save writes back to the
      // project's own file when it has one (ticket 12).
      registerMenuCommand('editor.saveProjectAs', () => {
        if (editor.media && !editor.savingProject && !editor.opening)
          void editor.saveProjectAs().catch(() => undefined);
      }),
      // Import Media… adds into the open project; with none open the first
      // video starts one (editor.importMedia routes to open()).
      registerMenuCommand('editor.importMedia', () => {
        if (!locked) void editor.importMedia().catch(() => undefined);
      }),
      // The native Edit menu dispatches here instead of using the `role: 'undo'/'redo'`
      // native text-field undo: one document history, not two stacks under one name.
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
