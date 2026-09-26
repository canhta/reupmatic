import { useRef, useState } from 'react';
import {
  changeEditor,
  type EditorHistory,
  openEditorHistory,
  redoEditor,
  undoEditor,
} from '../../../core/projects/editor-history';
import type { EditorSnapshot } from '../../../core/projects/project';

const initial: EditorSnapshot = { cues: [] };

export function useEditorDocument(onChange: () => void) {
  const [history, setHistory] = useState(() => openEditorHistory(initial));
  const current = useRef(history);

  function publish(next: EditorHistory, notify = true) {
    if (next === current.current) return;
    current.current = next;
    setHistory(next);
    if (notify) onChange();
  }
  return {
    history,
    snapshot: history.present,
    getSnapshot: () => current.current.present,
    change: (patch: Partial<EditorSnapshot>) => publish(changeEditor(current.current, patch)),
    restore: (snapshot: EditorSnapshot) => publish(openEditorHistory(snapshot), false),
    undo: () => publish(undoEditor(current.current)),
    redo: () => publish(redoEditor(current.current)),
  };
}
