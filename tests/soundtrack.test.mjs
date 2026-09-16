import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSoundtrack } from '../dist-core/editing/soundtrack.js';
import {
  changeEditor,
  openEditorHistory,
  undoEditor,
} from '../dist-core/projects/editor-history.js';
import { createProject, parseProject } from '../dist-core/projects/project.js';

const track = {
  source: { path: '/music.wav', name: 'music.wav', sha256: 'b'.repeat(64), duration_ms: 9000 },
  mode: 'mix',
  start_ms: 1000,
  end_ms: 6000,
  offset_ms: 2000,
  gain_db: -6,
  fade_in_ms: 300,
  fade_out_ms: 500,
};
test('soundtrack remains a per-document asset, with strict current project and undo support', () => {
  const snapshot = {
    cues: [],
    sample: { start_ms: 0, end_ms: 4000 },
    soundtrack: parseSoundtrack(track),
  };
  const project = createProject({ path: '/video.mp4', sha256: 'a'.repeat(64) }, snapshot);
  assert.deepEqual(parseProject(project).soundtrack, track);
  const history = changeEditor(openEditorHistory(snapshot), { soundtrack: undefined });
  assert.equal('soundtrack' in history.present, false);
  assert.deepEqual(undoEditor(history).present.soundtrack, track);
});
test('invalid paths, hashes, audio bounds, fades, and arbitrary worker inputs are rejected', () => {
  for (const patch of [
    { mode: 'loop' },
    { end_ms: 10000 },
    { end_ms: 1000 },
    { gain_db: Infinity },
    { fade_in_ms: 6000 },
    { offset_ms: -1 },
    { script: 'run' },
    { source: { ...track.source, sha256: 'changed' } },
    { source: { ...track.source, path: 'https://example.com/music' } },
  ]) {
    assert.throws(() => parseSoundtrack({ ...track, ...patch }), /INVALID_SOUNDTRACK/);
  }
});
