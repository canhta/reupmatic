import { editTextLayer } from '../subtitles/layers/commands.js';
import { sameText } from '../subtitles/layers/document.js';
import type { EditorSnapshot } from './project.js';

export interface EditorHistory {
  past: EditorSnapshot[];
  present: EditorSnapshot;
  future: EditorSnapshot[];
  /** The continuous gesture (a drag, a colour pick) that produced `present`, while it may merge. */
  gesture?: string;
}

export function openEditorHistory(snapshot: EditorSnapshot): EditorHistory {
  return { past: [], present: structuredClone(snapshot), future: [] };
}

/**
 * Applies a patch as one undo step. Changes that share a `gesture` key merge into the step the
 * gesture's first change opened, so a drag is one undo entry, not one per frame.
 */
export function changeEditor(
  history: EditorHistory,
  patch: Partial<EditorSnapshot>,
  gesture?: string,
): EditorHistory {
  let next = structuredClone({ ...history.present, ...patch });
  if (!('text_layers' in patch) && !sameText(history.present.cues, next.cues)) {
    next = editTextLayer({ ...next, cues: history.present.cues }, 'displayed', next.cues);
  }
  if (!next.processing) delete next.processing;
  if (!next.composition) delete next.composition;
  if (!next.soundtrack) delete next.soundtrack;
  if (!next.line_length) delete next.line_length;
  if (!next.media?.length) delete next.media;
  if (!next.voice_track) delete next.voice_track;
  if (!next.text_layers) delete next.text_layers;
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  if (gesture !== undefined && history.gesture === gesture)
    return { past: history.past, present: next, future: [], gesture };
  return {
    past: [...history.past, history.present].slice(-60),
    present: next,
    future: [],
    ...(gesture === undefined ? {} : { gesture }),
  };
}

export function undoEditor(history: EditorHistory): EditorHistory {
  const present = history.past.at(-1);
  if (present === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present,
    future: [history.present, ...history.future],
  };
}

export function redoEditor(history: EditorHistory): EditorHistory {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}
