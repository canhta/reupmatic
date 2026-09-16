import assert from 'node:assert/strict';
import test from 'node:test';
import { editComposition } from '../dist-core/editing/composition/commands.js';
import {
  compositionDuration,
  compositionPosition,
  compositionSpans,
  parseComposition,
} from '../dist-core/editing/composition/document.js';
import {
  changeEditor,
  openEditorHistory,
  redoEditor,
  undoEditor,
} from '../dist-core/projects/editor-history.js';
import { createProject, parseProject } from '../dist-core/projects/project.js';

const source = (name, duration = 4000) => ({
  path: `/${name}.mp4`,
  name: `${name}.mp4`,
  sha256: name.repeat(64),
  duration_ms: duration,
});
const clip = (id, name = 'a', start = 0, end = 2000, speed = 1) => ({
  id,
  source: source(name),
  start_ms: start,
  end_ms: end,
  speed,
});
const composition = () => ({
  version: 1,
  canvas: { width: 320, height: 180, fps: 30 },
  clips: [clip('clip-a'), clip('clip-b', 'b', 1000, 3000, 2)],
});
const cue = { id: 'cue-a', start_ms: 500, end_ms: 1500, text: 'Tiếng Việt — English' };

test('composition validates a bounded current document and owns source/output clock maps', () => {
  const value = parseComposition(composition());
  assert.equal(compositionDuration(value), 3000);
  assert.deepEqual(
    compositionSpans(value).map((s) => [s.start_ms, s.end_ms]),
    [
      [0, 2000],
      [2000, 3000],
    ],
  );
  assert.deepEqual(compositionPosition(value, 2250), { clip_id: 'clip-b', source_ms: 1500 });
  assert.equal(compositionPosition(value, 3000), null);
  for (const bad of [
    null,
    { ...value, version: 0 },
    { ...value, clips: [] },
    { ...value, canvas: { ...value.canvas, width: 319 } },
    { ...value, clips: [value.clips[0], value.clips[0]] },
    { ...value, clips: [clip('clip-a', 'a', 0, 5000)] },
    {
      ...value,
      clips: [
        { ...clip('clip-a'), source: { ...source('a'), path: 'https://example.com/private.mp4' } },
      ],
    },
    { ...value, clips: [{ ...clip('clip-a'), speed: 0 }] },
  ])
    assert.throws(() => parseComposition(bad), /COMPOSITION/);
});

test('reordering follows clip content and retains text/style without mutating the input', () => {
  const original = composition();
  const result = editComposition(original, [cue], { kind: 'move', id: 'clip-a', direction: 1 });
  assert.deepEqual(
    result.composition.clips.map((c) => c.id),
    ['clip-b', 'clip-a'],
  );
  assert.deepEqual(result.cues, [{ ...cue, start_ms: 1500, end_ms: 2500 }]);
  assert.equal(original.clips[0].id, 'clip-a');
});

test('split and contiguous join keep source maps and captions; unrelated clips cannot merge', () => {
  const before = composition();
  const split = editComposition(before, [cue], {
    kind: 'split',
    id: 'clip-a',
    at_ms: 1000,
    new_id: 'clip-c',
  });
  assert.deepEqual(
    split.composition.clips.map((c) => [c.id, c.start_ms, c.end_ms]),
    [
      ['clip-a', 0, 1000],
      ['clip-c', 1000, 2000],
      ['clip-b', 1000, 3000],
    ],
  );
  assert.deepEqual(
    split.cues.map((c) => [c.start_ms, c.end_ms, c.text]),
    [
      [500, 1000, cue.text],
      [1000, 1500, cue.text],
    ],
  );
  const joined = editComposition(split.composition, split.cues, { kind: 'join', id: 'clip-a' });
  assert.deepEqual(joined.composition, before);
  assert.throws(
    () => editComposition(before, [], { kind: 'join', id: 'clip-a' }),
    /COMPOSITION_JOIN/,
  );
});

test('trim and speed map remaining cue fragments, and removal drops only removed content', () => {
  const result = editComposition(
    composition(),
    [cue, { ...cue, id: 'b', start_ms: 2250, end_ms: 2750 }],
    { kind: 'update', id: 'clip-a', start_ms: 1000, end_ms: 2000, speed: 2 },
  );
  assert.equal(compositionDuration(result.composition), 1500);
  assert.deepEqual(
    result.cues.map((c) => [c.start_ms, c.end_ms]),
    [
      [0, 250],
      [750, 1250],
    ],
  );
  const removed = editComposition(result.composition, result.cues, {
    kind: 'remove',
    id: 'clip-a',
  });
  assert.equal(removed.cues.length, 1);
  assert.equal(removed.cues[0].start_ms, 250);
  assert.throws(
    () => editComposition(removed.composition, removed.cues, { kind: 'remove', id: 'clip-b' }),
    /COMPOSITION/,
  );
});

test('adding a repeated source never duplicates existing captions into the new instance', () => {
  const value = editComposition(composition(), [cue], {
    kind: 'append',
    clip: clip('clip-repeat'),
  });
  assert.deepEqual(value.cues, [cue]);
  assert.equal(compositionDuration(value.composition), 5000);
});

test('composition, captions and sample window are one undo/recovery-compatible project snapshot', () => {
  const snapshot = {
    cues: [cue],
    sample: { start_ms: 0, end_ms: 3000 },
    composition: composition(),
  };
  const project = createProject({ path: '/a.mp4', sha256: 'a'.repeat(64) }, snapshot);
  assert.equal(project.version, 5);
  assert.deepEqual(parseProject(project).composition, snapshot.composition);
  assert.throws(() => parseProject({ ...project, version: 2 }), /PROJECT_VERSION/);
  const changed = editComposition(snapshot.composition, snapshot.cues, {
    kind: 'move',
    id: 'clip-a',
    direction: 1,
  });
  const history = changeEditor(openEditorHistory(snapshot), changed);
  assert.deepEqual(undoEditor(history).present, snapshot);
  assert.deepEqual(redoEditor(undoEditor(history)).present.composition, changed.composition);
});

test('project clip references cannot authorize ungranted or changed native files', async () => {
  const { authorizedCompositionSources } = await import(
    '../dist-core/editing/composition/dependencies.js'
  );
  const value = composition();
  assert.equal(authorizedCompositionSources(value, [source('a'), source('b')]).size, 2);
  for (const grants of [
    [source('a')],
    [source('a'), { ...source('b'), sha256: 'c'.repeat(64) }],
    [source('a'), { ...source('b'), duration_ms: 5000 }],
    [source('a'), { ...source('b'), path: '/elsewhere.mp4' }],
  ]) {
    assert.throws(() => authorizedCompositionSources(value, grants), /COMPOSITION_UNAUTHORIZED/);
  }
});

test('composition snapshot clamps dependent ranges atomically without discarding other edits', async () => {
  const { compositionSnapshot } = await import('../dist-core/editing/composition/snapshot.js');
  const doc = composition();
  const snapshot = {
    cues: [],
    sample: { start_ms: 3500, end_ms: 4000 },
    processing: {
      version: 1,
      editing: { trim: { start_ms: 3500, end_ms: 4000 }, speed: 2 },
    },
  };
  const next = compositionSnapshot(snapshot, doc, []);
  assert.deepEqual(next.sample, { start_ms: 2999, end_ms: 3000 });
  assert.deepEqual(next.processing.editing.trim, next.sample);
  assert.equal(next.processing.editing.speed, 2);
  assert.equal(snapshot.sample.end_ms, 4000);
});

test('saved compositions protect every member source and recovery retains all dependencies', async (t) => {
  const { mkdtemp, readFile, writeFile, rm } = await import('node:fs/promises');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { saveProject, loadProject } = await import('../dist-core/projects/project.js');
  const { RecoveryStore } = await import('../dist-core/projects/recovery/recovery-store.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'composition-safety-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const original = path.join(root, 'member.reupmatic.json');
  await writeFile(original, 'original bytes');
  const doc = composition();
  doc.clips[1].source.path = original;
  const project = createProject(
    { path: path.join(root, 'anchor.mp4'), sha256: 'a'.repeat(64) },
    {
      composition: doc,
      cues: [cue],
      sample: { start_ms: 0, end_ms: 3000 },
    },
  );
  await assert.rejects(saveProject(original, project), /SOURCE/);
  assert.equal(await readFile(original, 'utf8'), 'original bytes');
  const filename = path.join(root, 'saved.reupmatic.json');
  await saveProject(filename, project);
  assert.deepEqual(await loadProject(filename), project);
  const storeFile = path.join(root, 'recovery.sqlite');
  let store = new RecoveryStore(storeFile);
  try {
    store.save('composition-001', 0, project);
    store.close();
    store = new RecoveryStore(storeFile);
    assert.deepEqual(store.load('composition-001', 1), project);
  } finally {
    store.close();
  }
});

test('composition cue fragmentation is bounded and a failed operation leaves the document intact', () => {
  const doc = composition(),
    before = structuredClone(doc);
  const cues = Array.from({ length: 5001 }, (_, index) => ({
    id: `wide-${index}`,
    start_ms: 0,
    end_ms: 3000,
    text: 'Retain me',
  }));
  assert.throws(
    () => editComposition(doc, cues, { kind: 'move', id: 'clip-a', direction: 1 }),
    /COMPOSITION_CUE_LIMIT/,
  );
  assert.deepEqual(doc, before);
  assert.equal(cues.length, 5001);
});

test('caption appearance survives splitting and cannot be mutated through the returned fragment', async () => {
  const { defaultSubtitleStyle } = await import('../dist-core/subtitles/style.js');
  const styled = { ...cue, style: { ...defaultSubtitleStyle, bold: true } };
  const result = editComposition(composition(), [styled], {
    kind: 'split',
    id: 'clip-a',
    at_ms: 1000,
    new_id: 'cut-new',
  });
  assert.ok(result.cues.every((item) => item.style.bold === true));
  result.cues[0].style.bold = false;
  assert.equal(styled.style.bold, true);
  assert.equal(result.cues[1].style.bold, true);
});

test('deduplicated registrations cannot silently replace a conflicting pinned source duration', async () => {
  const { registerComposition } = await import('../dist-core/rendering/composition-input.js');
  const doc = composition();
  doc.clips[1].source = { ...doc.clips[0].source, duration_ms: 10000 };
  await assert.rejects(
    registerComposition(doc, async () => ({ asset_id: 'registered', sha256: 'a'.repeat(64) })),
    /SOURCE_CHANGED/,
  );
});
