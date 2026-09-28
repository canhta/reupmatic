import assert from 'node:assert/strict';
import test from 'node:test';
import { joinActivity } from '../../dist-core/batch/batch-activity.js';
import { editorActivity } from '../../dist-core/editing/editor-activity.js';

const idle = { export: null, speech: null, ocr: null, translate: null, voiceover: null };

test('an idle editor has no activity', () => {
  assert.equal(editorActivity(idle), null);
});

test('a running editor operation reports its kind, phase and progress', () => {
  assert.deepEqual(
    editorActivity({ ...idle, translate: { phase: 'translationRunning', fraction: 0.426 } }),
    { kind: 'translate', phase: 'translationRunning', percent: 43 },
  );
});

test('an operation without a known fraction has no percent', () => {
  assert.deepEqual(editorActivity({ ...idle, export: { phase: 'rendering', fraction: null } }), {
    kind: 'export',
    phase: 'rendering',
    percent: null,
  });
});

test('with several running, export leads, then the order the editor runs them', () => {
  const running = { phase: 'running', fraction: null };
  assert.equal(editorActivity({ ...idle, voiceover: running, speech: running }).kind, 'speech');
  assert.equal(
    editorActivity({ ...idle, voiceover: running, speech: running, export: running }).kind,
    'export',
  );
});

test('batch and editor activity share one line when short, batch wins when not', () => {
  assert.equal(joinActivity('', ''), '');
  assert.equal(joinActivity('a.mp4 · Encoding · 42%', ''), 'a.mp4 · Encoding · 42%');
  assert.equal(joinActivity('', 'Export · Rendering'), 'Export · Rendering');
  assert.equal(
    joinActivity('a.mp4 · Encoding · 42%', 'Export · Rendering'),
    'a.mp4 · Encoding · 42% · Export · Rendering',
  );
  const long = `${'very-long-source-name'.repeat(3)}.mp4 · Encoding · 42%`;
  assert.equal(joinActivity(long, 'Translation · Translating text · 40%'), long);
});
