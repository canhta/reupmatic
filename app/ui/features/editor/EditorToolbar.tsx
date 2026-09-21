import { EditorExportDialog } from './EditorExportDialog';
import { EditorProfileSwitcher } from './EditorProfileSwitcher';
import { EditorProjectHeader } from './EditorProjectHeader';

// Split from a single EditorHeader row into two toolbar slots (title,
// actions) so App.tsx can place them inside the shell's one unified TopNav
// band instead of a second, Editor-only header row — see workspace.css and
// The Shell section defines the single-toolbar rule.
//
// The title slot IS the project (D-63): its name, renamed in place, plus Save
// and the saved/unsaved state. The actions slot is Profile ▾ (the only profile
// picker in the window) · Export… (the one primary action). Jobs stays in the
// shared status bar (WorkspaceStatusBar/JobsTray) — one home, not a second
// Jobs affordance duplicated into this header.

export function EditorToolbarTitle() {
  return <EditorProjectHeader />;
}

export function EditorToolbarActions() {
  // Profile ▾ stays enabled and Export… disables itself
  // (EditorExportDialog's own trigger checks `editor.media`) — neither
  // unmounts just because no video is open yet.
  return (
    <div className="workspace-command-actions">
      <EditorProfileSwitcher />
      <EditorExportDialog />
    </div>
  );
}
