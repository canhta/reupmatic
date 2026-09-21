import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changeEditor,
  openEditorHistory,
  redoEditor,
  undoEditor,
} from '../../dist-core/projects/editor-history.js';

const initial = {
  cues: [{ id: 'cue', start_ms: 0, end_ms: 1000, text: 'Tiếng Việt' }],
  sample: { start_ms: 0, end_ms: 1000 },
};
test('editor undo restores video/audio, sample and subtitle changes as whole snapshots', () => {
  const opened = openEditorHistory(initial);
  let state = changeEditor(opened, {
    processing: { editing: { speed: 2, audio: { muted: true, gain_db: 0 } } },
  });
  state = changeEditor(state, {
    sample: { start_ms: 500, end_ms: 1000 },
    cues: [{ ...initial.cues[0], text: 'Changed' }],
  });
  const previous = undoEditor(state);
  assert.equal(previous.present.cues[0].text, 'Tiếng Việt');
  assert.equal(previous.present.processing.editing.speed, 2);
  assert.deepEqual(undoEditor(previous).present, initial);
  assert.deepEqual(redoEditor(previous).present, state.present);
  assert.deepEqual(opened.present, initial);
});
test('no-op changes retain identity, history is bounded and branch edits invalidate redo', () => {
  const opened = openEditorHistory(initial);
  assert.equal(changeEditor(opened, { cues: structuredClone(initial.cues) }), opened);
  let state = opened;
  for (let n = 1; n < 80; n++)
    state = changeEditor(state, { sample: { start_ms: n, end_ms: 1000 } });
  assert.equal(state.past.length, 60);
  const branch = changeEditor(undoEditor(state), {
    processing: { editing: { speed: 2 } },
  });
  assert.equal(branch.future.length, 0);
  assert.equal(redoEditor(branch), branch);
  const cleared = changeEditor(branch, { processing: undefined });
  assert.equal(Object.hasOwn(cleared.present, 'processing'), false);
});
