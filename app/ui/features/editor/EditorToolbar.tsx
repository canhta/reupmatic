import { EditorExportDialog } from './EditorExportDialog';
import { EditorProfileSwitcher } from './EditorProfileSwitcher';
import { EditorProjectHeader } from './EditorProjectHeader';

export function EditorToolbarTitle() {
  return <EditorProjectHeader />;
}

export function EditorToolbarActions() {
  return (
    <div className="workspace-command-actions">
      <EditorProfileSwitcher />
      <EditorExportDialog />
    </div>
  );
}
