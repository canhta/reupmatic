/** An editor operation that runs outside the batch queue. */
export type EditorOperationKind = 'export' | 'speech' | 'ocr' | 'translate' | 'voiceover';

export type EditorOperations = Record<
  EditorOperationKind,
  { phase: string; fraction: number | null } | null
>;

export interface EditorActivity {
  kind: EditorOperationKind;
  phase: string;
  percent: number | null;
}

const ORDER: readonly EditorOperationKind[] = ['export', 'speech', 'ocr', 'translate', 'voiceover'];

/** The one editor operation the status bar reports; export first, as it locks the editor. */
export function editorActivity(operations: EditorOperations): EditorActivity | null {
  for (const kind of ORDER) {
    const running = operations[kind];
    if (running) {
      return {
        kind,
        phase: running.phase,
        percent: running.fraction == null ? null : Math.round(running.fraction * 100),
      };
    }
  }
  return null;
}
