import assert from 'node:assert/strict';
import test from 'node:test';
import { editComposition } from '../../dist-core/editing/composition/commands.js';
import {
  clipCuesToEnabled,
  compositionDuration,
  compositionPosition,
  compositionSpans,
  MAX_CLIPS,
  parseComposition,
} from '../../dist-core/editing/composition/document.js';
import {
  changeEditor,
  openEditorHistory,
  redoEditor,
  undoEditor,
} from '../../dist-core/projects/editor-history.js';
import { createProject, parseProject } from '../../dist-core/projects/project.js';

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
  enabled: true,
});
const composition = () => ({
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

test('inserting a clip at an index places it before the clip already there and shifts later cues', () => {
  const inserted = editComposition(composition(), [cue], {
    kind: 'insert',
    index: 0,
    clip: clip('clip-new', 'c'),
  });
  assert.deepEqual(
    inserted.composition.clips.map((c) => c.id),
    ['clip-new', 'clip-a', 'clip-b'],
  );
  assert.deepEqual(
    inserted.cues.map((c) => [c.start_ms, c.end_ms]),
    [[2500, 3500]],
  );
  assert.equal(compositionDuration(inserted.composition), 5000);
  assert.deepEqual(
    editComposition(composition(), [cue], {
      kind: 'insert',
      index: 2,
      clip: clip('clip-new', 'c'),
    }).composition.clips.map((c) => c.id),
    ['clip-a', 'clip-b', 'clip-new'],
  );
  for (const index of [-1, 3]) {
    assert.throws(
      () =>
        editComposition(composition(), [], { kind: 'insert', index, clip: clip('clip-x', 'x') }),
      /INVALID_COMPOSITION/,
    );
  }
});

test('placing past MAX_CLIPS is refused by its own limit code, never truncated', () => {
  const full = {
    canvas: { width: 320, height: 180, fps: 30 },
    clips: Array.from({ length: MAX_CLIPS }, (_, index) => clip(`clip-${index}`, 'a')),
  };
  assert.throws(
    () =>
      editComposition(full, [], {
        kind: 'insert',
        index: full.clips.length,
        clip: clip('clip-extra'),
      }),
    /COMPOSITION_CLIP_LIMIT/,
  );
  assert.throws(
    () => parseComposition({ ...full, clips: [...full.clips, clip('clip-extra', 'a')] }),
    /COMPOSITION_CLIP_LIMIT/,
  );
  assert.equal(full.clips.length, MAX_CLIPS);
});

test('composition and captions are one undo/recovery-compatible project snapshot', () => {
  const snapshot = {
    cues: [cue],
    composition: composition(),
  };
  const project = createProject({ path: '/a.mp4', sha256: 'a'.repeat(64) }, snapshot);
  assert.deepEqual(parseProject(project).composition, snapshot.composition);
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
    '../../dist-core/editing/composition/dependencies.js'
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
  const { compositionSnapshot } = await import('../../dist-core/editing/composition/snapshot.js');
  const doc = composition();
  const snapshot = {
    cues: [],
    processing: {
      editing: { trim: { start_ms: 3500, end_ms: 4000 }, speed: 2 },
    },
  };
  const next = compositionSnapshot(snapshot, doc, []);
  assert.deepEqual(next.processing.editing.trim, { start_ms: 2999, end_ms: 3000 });
  assert.equal(next.processing.editing.speed, 2);
  assert.equal(snapshot.processing.editing.trim.end_ms, 4000);
});

test('saved compositions protect every member source and recovery retains all dependencies', async (t) => {
  const { mkdtemp, readFile, writeFile, rm } = await import('node:fs/promises');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { saveProject, loadProject } = await import('../../dist-core/projects/project.js');
  const { ProjectRecovery } = await import('../../dist-core/projects/recovery/project-recovery.js');
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
    },
  );
  await assert.rejects(saveProject(original, project), /SOURCE/);
  assert.equal(await readFile(original, 'utf8'), 'original bytes');
  const filename = path.join(root, 'saved.reupmatic.json');
  await saveProject(filename, project);
  assert.deepEqual(await loadProject(filename), project);
  const storeFile = path.join(root, 'recovery.sqlite');
  let store = new ProjectRecovery(storeFile);
  try {
    store.save('composition-001', 0, project);
    store.close();
    store = new ProjectRecovery(storeFile);
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
  const { defaultSubtitleStyle } = await import('../../dist-core/subtitles/style.js');
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
  const { registerComposition } = await import('../../dist-core/rendering/composition-input.js');
  const doc = composition();
  doc.clips[1].source = { ...doc.clips[0].source, duration_ms: 10000 };
  await assert.rejects(
    registerComposition(doc, async () => ({ asset_id: 'registered', sha256: 'a'.repeat(64) })),
    /SOURCE_CHANGED/,
  );
});

const projectSource = { path: '/videos/a.mp4', sha256: 'a'.repeat(64) };
const voiceLine = (cue_id, offset_ms, slot_ms, speech_ms, rate = 1) => ({
  cue_id,
  offset_ms,
  rate,
  slot_ms,
  speech_ms,
  overrun_ms: 0,
});
function voiceTrack(lines) {
  let frame = 0;
  const segments = lines.map((line) => {
    const start_frame = frame;
    frame += line.speech_ms * 48;
    return { cue_id: line.cue_id, start_frame, end_frame: frame, lead_silence_frames: 0 };
  });
  const frames = Math.max(1, frame);
  return {
    artifact: {
      artifact_id: '11111111-1111-4111-8111-111111111111',
      sha256: 'b'.repeat(64),
      sample_rate: 48000,
      frames,
      duration_ms: Math.ceil((frames * 1000) / 48000),
    },
    plan: { engine_targets_duration: false, lines, conflicts: [] },
    segments,
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
  };
}
const voiced = (lines, cues = [cue]) => ({
  cues,
  composition: composition(),
  voice_track: voiceTrack(lines),
});

test('reordering clips carries a voice line to the new output clock through the one cue mapping', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const next = editCompositionSnapshot(voiced([voiceLine('cue-a', 500, 1000, 800)]), [
    { kind: 'move', id: 'clip-a', direction: 1 },
  ]);
  assert.equal(next.voice_track.stale, false);
  assert.deepEqual(
    next.voice_track.plan.lines.map((line) => [line.cue_id, line.offset_ms, line.slot_ms]),
    [['cue-a', 1500, 1000]],
  );
  assert.deepEqual(
    next.voice_track.segments,
    voiceTrack([voiceLine('cue-a', 500, 1000, 800)]).segments,
  );
});

test('splitting a clip carries a voice line whose span the cut crosses', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const next = editCompositionSnapshot(voiced([voiceLine('cue-a', 500, 1000, 800)]), [
    { kind: 'split', id: 'clip-a', at_ms: 1000, new_id: 'cut-new' },
  ]);
  assert.equal(next.voice_track.stale, false);
  assert.deepEqual(
    next.voice_track.plan.lines.map((line) => [line.cue_id, line.offset_ms, line.slot_ms]),
    [['cue-a', 500, 1000]],
  );
});

test('a speed change carries the voice anchor but marks the plan stale for the slots it no longer has', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const next = editCompositionSnapshot(voiced([voiceLine('cue-a', 500, 1000, 800)]), [
    { kind: 'update', id: 'clip-a', start_ms: 0, end_ms: 2000, speed: 2 },
  ]);
  assert.equal(next.voice_track.stale, true);
  assert.deepEqual(
    next.voice_track.plan.lines.map((line) => [line.offset_ms, line.slot_ms, line.rate]),
    [[250, 500, 1]],
  );
});

test('a trim that removes the span a line sat in drops that line from plan and segments and stales the track', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const next = editCompositionSnapshot(voiced([voiceLine('cue-a', 500, 1000, 800)]), [
    { kind: 'update', id: 'clip-a', start_ms: 1000, end_ms: 2000, speed: 2 },
  ]);
  assert.equal(next.voice_track.stale, true);
  assert.deepEqual(next.voice_track.plan.lines, []);
  assert.deepEqual(next.voice_track.segments, []);
  const project = createProject(projectSource, next);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
});

test('removing one clip drops only its voice line and keeps the others carried and stale', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const cues = [cue, { ...cue, id: 'cue-b', start_ms: 2250, end_ms: 2750 }];
  const next = editCompositionSnapshot(
    voiced([voiceLine('cue-a', 500, 1750, 800), voiceLine('cue-b', 2250, 500, 400)], cues),
    [{ kind: 'remove', id: 'clip-b' }],
  );
  assert.equal(next.voice_track.stale, true);
  assert.deepEqual(
    next.voice_track.plan.lines.map((line) => [line.cue_id, line.offset_ms, line.slot_ms]),
    [['cue-a', 500, 1500]],
  );
  assert.deepEqual(
    next.voice_track.segments.map((segment) => segment.cue_id),
    ['cue-a'],
  );
});

test('a composition edit repoints the voice origin at the remapped spoken layer while the plan still holds', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const { editTextLayer } = await import('../../dist-core/subtitles/layers/commands.js');
  let snapshot = editTextLayer({ cues: [cue], composition: composition() }, 'spoken', [cue]);
  const track = voiceTrack([voiceLine('cue-a', 500, 1000, 800)]);
  track.origin = { kind: 'copy', layer: 'spoken', token: snapshot.text_layers.spoken.token };
  snapshot = { ...snapshot, voice_track: track };
  const next = editCompositionSnapshot(snapshot, [{ kind: 'move', id: 'clip-a', direction: 1 }]);
  assert.equal(next.voice_track.stale, false);
  assert.notEqual(next.text_layers.spoken.token, snapshot.text_layers.spoken.token);
  assert.equal(next.voice_track.origin.token, next.text_layers.spoken.token);
});

test('a composition-stale voice track is refused through the same staleness gate a text edit uses', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const { verifyVoiceTrack } = await import('../../dist-core/speech/synthesis/admission.js');
  const next = editCompositionSnapshot(voiced([voiceLine('cue-a', 500, 1000, 800)]), [
    { kind: 'update', id: 'clip-a', start_ms: 0, end_ms: 2000, speed: 2 },
  ]);
  assert.equal(next.voice_track.stale, true);
  await assert.rejects(verifyVoiceTrack(next.voice_track, {}, {}), /VOICE_TRACK_STALE/);
});

test('the remap judges conflicts by the shipped timing policy, never a second literal', async () => {
  const { editCompositionSnapshot } = await import(
    '../../dist-core/editing/composition/snapshot.js'
  );
  const { SHIPPED_VOICE_TIMING_POLICY } = await import(
    '../../dist-core/speech/synthesis/timing.js'
  );
  const remapped = (speech_ms) =>
    editCompositionSnapshot(voiced([voiceLine('cue-a', 500, 1000, speech_ms)]), [
      { kind: 'update', id: 'clip-a', start_ms: 0, end_ms: 2000, speed: 2 },
    ]).voice_track.plan;
  const tolerance = SHIPPED_VOICE_TIMING_POLICY.acceptable_overrun_ms;
  const fits = remapped(400);
  assert.equal(fits.lines[0].overrun_ms, 0);
  assert.deepEqual(fits.conflicts, []);
  const overruns = remapped(800);
  assert.ok(overruns.lines[0].overrun_ms > tolerance);
  assert.deepEqual(
    overruns.conflicts,
    overruns.lines.filter((line) => line.overrun_ms > tolerance),
  );
  assert.deepEqual(
    overruns.conflicts.map((line) => line.cue_id),
    ['cue-a'],
  );
});

test('a clip without an enabled flag is refused, never default-filled', () => {
  const { enabled, ...missing } = clip('clip-a');
  assert.equal(enabled, true);
  assert.throws(
    () => parseComposition({ canvas: { width: 320, height: 180, fps: 30 }, clips: [missing] }),
    /INVALID_COMPOSITION/,
  );
  assert.throws(
    () =>
      parseComposition({
        canvas: { width: 320, height: 180, fps: 30 },
        clips: [{ ...clip('clip-a'), enabled: 'yes' }],
      }),
    /INVALID_COMPOSITION/,
  );
});

test('disabling a clip keeps its placement and trims and is one undo step', () => {
  const doc = composition();
  const disabled = editComposition(doc, [], { kind: 'enable', id: 'clip-a', enabled: false });
  const kept = disabled.composition.clips.find((c) => c.id === 'clip-a');
  assert.deepEqual(
    { start_ms: kept.start_ms, end_ms: kept.end_ms, speed: kept.speed, enabled: kept.enabled },
    { start_ms: 0, end_ms: 2000, speed: 1, enabled: false },
  );
  assert.equal(compositionDuration(disabled.composition), 3000);
  assert.deepEqual(
    compositionSpans(disabled.composition).map((s) => [s.start_ms, s.end_ms]),
    [
      [0, 2000],
      [2000, 3000],
    ],
  );
  assert.equal(compositionPosition(disabled.composition, 1000), null);
  assert.deepEqual(compositionPosition(disabled.composition, 2500), {
    clip_id: 'clip-b',
    source_ms: 2000,
  });
  const restored = editComposition(disabled.composition, [], {
    kind: 'enable',
    id: 'clip-a',
    enabled: true,
  });
  assert.deepEqual(restored.composition, parseComposition(doc));
  let history = openEditorHistory({
    cues: [cue],
    composition: doc,
  });
  history = changeEditor(history, {
    composition: editComposition(history.present.composition, [], {
      kind: 'enable',
      id: 'clip-a',
      enabled: false,
    }).composition,
  });
  assert.equal(history.past.length, 1);
  assert.equal(undoEditor(history).present.composition.clips[0].enabled, true);
});

test('cues only render over enabled clips and keep every stored cue', () => {
  const doc = composition();
  const wide = [
    { id: 'over-a', start_ms: 500, end_ms: 1500, text: 'On the disabled clip' },
    { id: 'over-b', start_ms: 2200, end_ms: 2800, text: 'On the enabled clip' },
    { id: 'straddle', start_ms: 1800, end_ms: 2400, text: 'Across the boundary' },
  ];
  const disabled = editComposition(doc, wide, {
    kind: 'enable',
    id: 'clip-a',
    enabled: false,
  }).composition;
  const rendered = clipCuesToEnabled(disabled, wide);
  assert.deepEqual(
    rendered.map((c) => [c.id, c.start_ms, c.end_ms]),
    [
      ['straddle', 2000, 2400],
      ['over-b', 2200, 2800],
    ],
  );
  assert.deepEqual(
    wide.map((c) => c.id),
    ['over-a', 'over-b', 'straddle'],
  );
  assert.deepEqual(clipCuesToEnabled(doc, wide), wide);
});
