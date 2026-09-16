import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { useEditorModel } from './useEditorModel';

const EditorContext = createContext<ReturnType<typeof useEditorModel> | null>(null);

export function EditorProvider({
  children,
  onDirty,
}: {
  children: ReactNode;
  onDirty: (dirty: boolean) => void;
}) {
  const editor = useEditorModel();
  useEffect(() => onDirty(editor.dirty), [editor.dirty, onDirty]);
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('Editor components require EditorProvider');
  return editor;
}
