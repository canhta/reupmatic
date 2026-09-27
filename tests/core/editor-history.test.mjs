import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changeEditor,
  openEditorHistory,
  redoEditor,
  undoEditor,
} from '../../dist-core/projects/editor-history.js';
import { createProject } from '../../dist-core/projects/project.js';
import { editTextLayer } from '../../dist-core/subtitles/layers/commands.js';

const initial = {
  cues: [{ id: 'cue', start_ms: 0, end_ms: 1000, text: 'Tiếng Việt' }],
};
const source = { path: '/videos/tự quay.mp4', sha256: 'a'.repeat(64) };
test('editor undo restores video/audio and subtitle changes as whole snapshots', () => {
  const opened = openEditorHistory(initial);
  let state = changeEditor(opened, {
    processing: { editing: { speed: 2, audio: { muted: true, gain_db: 0 } } },
  });
  state = changeEditor(state, {
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
    state = changeEditor(state, { cues: [{ ...initial.cues[0], text: String(n) }] });
  assert.equal(state.past.length, 60);
  const branch = changeEditor(undoEditor(state), {
    processing: { editing: { speed: 2 } },
  });
  assert.equal(branch.future.length, 0);
  assert.equal(redoEditor(branch), branch);
  const cleared = changeEditor(branch, { processing: undefined });
  assert.equal(Object.hasOwn(cleared.present, 'processing'), false);
});

test('removing the voice track or text layers drops the key so the project stays saveable', () => {
  let state = openEditorHistory({
    ...editTextLayer(initial, 'spoken', [{ id: 'gone', start_ms: 0, end_ms: 500, text: 'nháp' }]),
    voice_track: {
      artifact: {
        artifact_id: '11111111-1111-4111-8111-111111111111',
        sha256: 'b'.repeat(64),
        sample_rate: 48000,
        frames: 4800,
        duration_ms: 100,
      },
      plan: { engine_targets_duration: false, lines: [], conflicts: [] },
      segments: [],
      mode: 'mix',
      gain_db: 0,
      fade_in_ms: 0,
      fade_out_ms: 0,
      muted: false,
      origin: { kind: 'copy', layer: 'spoken', token: 'spoken-12345678' },
      provenance: {
        engine: 'vieneu-v3-turbo-onnx',
        model_id: 'a'.repeat(64),
        voice_id: 'test-voice',
        runtime: 'controlled-sdk',
        request_id: 'request-12345678',
        language: 'vi',
      },
      stale: false,
    },
  });
  state = changeEditor(state, { voice_track: undefined });
  state = changeEditor(state, { text_layers: undefined });
  assert.equal(Object.hasOwn(state.present, 'voice_track'), false);
  assert.equal(Object.hasOwn(state.present, 'text_layers'), false);
  assert.doesNotThrow(() => createProject(source, state.present));
});
