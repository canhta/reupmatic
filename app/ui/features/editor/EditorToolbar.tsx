import { HStack } from '@astryxdesign/core/HStack';
import { EditorExportDialog } from './EditorExportDialog';
import { EditorProfileSwitcher } from './EditorProfileSwitcher';
import { EditorProjectHeader } from './EditorProjectHeader';

export function EditorToolbarTitle() {
  return <EditorProjectHeader />;
}

export function EditorToolbarActions() {
  return (
    <HStack vAlign="center" className="workspace-command-actions">
      <EditorProfileSwitcher />
      <EditorExportDialog />
    </HStack>
  );
}
