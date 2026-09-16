import assert from 'node:assert/strict';
import test from 'node:test';
import { getTextLayer, parseTextLayers } from '../dist-core/subtitles/layers/document.js';
import { editTextLayer, previewLayerCopy, applyLayerCopy } from '../dist-core/subtitles/layers/commands.js';
import { changeEditor, openEditorHistory, undoEditor, redoEditor } from '../dist-core/projects/editor-history.js';
import { createProject, parseProject } from '../dist-core/projects/project.js';

const cue = (text = 'Xin chào') => ({ id: 'cue-1', start_ms: 0, end_ms: 1000, text });
const empty = () => ({ cues: [cue()], sample: { start_ms: 0, end_ms: 2000 } });
const copy = (snapshot, from, to) => applyLayerCopy(snapshot, previewLayerCopy(snapshot, from, to));

test('four text layers have independent content and one canonical displayed track', () => {
  let s = copy(empty(), 'displayed', 'spoken');
  s = editTextLayer(s, 'spoken', [cue('Nội dung đọc')]);
  assert.equal(s.cues[0].text, 'Xin chào');
  assert.equal(getTextLayer(s, 'spoken').cues[0].text, 'Nội dung đọc');
  assert.deepEqual(getTextLayer(s, 'transcript').cues, []);
  assert.equal('cues' in s.text_layers.displayed, false);
  assert.deepEqual(parseTextLayers(s.text_layers), s.text_layers);
});

test('copy is previewed, explicit, detached and stale targets or sources cannot be overwritten', () => {
  const s = empty();
  const preview = previewLayerCopy(s, 'displayed', 'spoken');
  assert.equal(s.text_layers, undefined);
  const edited = editTextLayer(s, 'spoken', [cue('Keep my edits')]);
  assert.throws(() => applyLayerCopy(edited, preview), /STALE_OPERATION/);
  const sourceChanged = editTextLayer(s, 'displayed', [cue('Changed')]);
  assert.throws(() => applyLayerCopy(sourceChanged, preview), /STALE_OPERATION/);
  const copied = applyLayerCopy(s, preview);
  preview.cues[0].text = 'mutated';
  assert.equal(getTextLayer(copied, 'spoken').cues[0].text, 'Xin chào');
  assert.equal(getTextLayer(copied, 'spoken').origin.kind, 'copy');
});

test('upstream text edits invalidate descendants without replacing their text', () => {
  let s = editTextLayer(empty(), 'transcript', [cue('Source')]);
  s = copy(s, 'transcript', 'translated');
  s = copy(s, 'translated', 'spoken');
  s = editTextLayer(s, 'transcript', [cue('Corrected')]);
  assert.equal(getTextLayer(s, 'translated').stale, true);
  assert.equal(getTextLayer(s, 'spoken').stale, true);
  assert.equal(getTextLayer(s, 'spoken').cues[0].text, 'Source');
  assert.equal(getTextLayer(s, 'displayed').stale, false);
  assert.throws(() => previewLayerCopy(s, 'translated', 'displayed'), /TEXT_LAYER_STALE/);
});

test('presentation-only subtitle changes do not invalidate or rewrite spoken text', () => {
  const s = copy(empty(), 'displayed', 'spoken');
  const h = changeEditor(openEditorHistory(s), { cues: [{ ...cue(), style: { font_size: 40 } }] });
  assert.equal(getTextLayer(h.present, 'displayed').token, getTextLayer(s, 'displayed').token);
  assert.equal(getTextLayer(h.present, 'spoken').stale, false);
});

test('existing displayed edit commands update ownership and whole-document undo/redo', () => {
  const s = copy(empty(), 'displayed', 'spoken');
  const before = openEditorHistory(s);
  const edited = changeEditor(before, { cues: [cue('New display')] });
  assert.equal(getTextLayer(edited.present, 'spoken').stale, true);
  assert.equal(getTextLayer(edited.present, 'spoken').cues[0].text, 'Xin chào');
  assert.deepEqual(undoEditor(edited).present, before.present);
  assert.deepEqual(redoEditor(undoEditor(edited)).present, edited.present);
});

test('manual corrections retain STT provenance and language independent of UI locale', () => {
  const origin = { kind: 'stt', request_id: 'request-123', source_sha256: 'a'.repeat(64),
    start_ms: 0, end_ms: 2000, model_id: 'b'.repeat(64) };
  let s = editTextLayer(empty(), 'transcript', [cue()], { language: 'vi', origin });
  s = editTextLayer(s, 'transcript', [cue('Đã sửa')]);
  assert.deepEqual(getTextLayer(s, 'transcript').origin, origin);
  assert.equal(getTextLayer(s, 'transcript').language, 'vi');
  assert.equal(getTextLayer(s, 'transcript').edited, true);
  assert.equal(getTextLayer(s, 'translated').language, null);
});

test('project schema 5 persists layers and refuses previous or malformed formats', () => {
  const s = copy(empty(), 'displayed', 'translated');
  const p = createProject({ path: '/source.mp4', sha256: 'a'.repeat(64) }, s);
  assert.equal(p.version, 5);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
  assert.throws(() => parseProject({ ...p, version: 3 }), /PROJECT_VERSION/);
  const bad = structuredClone(p);
  bad.text_layers.spoken.origin = { kind: 'script', command: 'run' };
  assert.throws(() => parseProject(bad), /INVALID_TEXT_LAYERS/);
});

test('layer validation rejects duplicate metadata, styles in speech and forged copy previews', () => {
  const s = copy(empty(), 'displayed', 'spoken');
  const bad = structuredClone(s.text_layers);
  bad.spoken.cues[0].style = { font_size: 40 };
  assert.throws(() => parseTextLayers(bad), /INVALID_TEXT_LAYERS/);
  const p = previewLayerCopy(empty(), 'displayed', 'translated');
  p.cues[0].text = 'Injected';
  assert.throws(() => applyLayerCopy(empty(), p), /STALE_OPERATION/);
});

test('composition rebases every text clock without replacing independent words or falsely invalidating copies', async () => {
  const { editCompositionSnapshot } = await import('../dist-core/editing/composition/snapshot.js');
  const composition = { version: 1, canvas: { width: 320, height: 180, fps: 30 }, clips: [{ id: 'clip-a',
    source: { path: '/source.mp4', name: 'source.mp4', sha256: 'a'.repeat(64), duration_ms: 4000 },
    start_ms: 0, end_ms: 4000, speed: 1 }] };
  let s = { cues: [{ ...cue('Displayed'), start_ms: 1000, end_ms: 3000 }],
    sample: { start_ms: 0, end_ms: 4000 }, composition };
  s = editTextLayer(s, 'transcript', [{ ...cue('Transcript'), start_ms: 1000, end_ms: 3000 }]);
  s = copy(s, 'transcript', 'translated');
  s = editTextLayer(s, 'spoken', [{ ...cue('Spoken independently'), start_ms: 1000, end_ms: 3000 }]);
  const next = editCompositionSnapshot(s, [{ kind: 'update', id: 'clip-a', start_ms: 1000, end_ms: 3000, speed: 2 }]);
  assert.deepEqual(['transcript', 'translated', 'spoken', 'displayed'].map(name => {
    const layer = getTextLayer(next, name);
    return [layer.cues[0].start_ms, layer.cues[0].end_ms, layer.cues[0].text, layer.stale];
  }), [[0, 1000, 'Transcript', false], [0, 1000, 'Transcript', false],
    [0, 1000, 'Spoken independently', false], [0, 1000, 'Displayed', false]]);
  assert.equal(next.text_layers.translated.origin.token, next.text_layers.transcript.token);
  assert.deepEqual(undoEditor(changeEditor(openEditorHistory(s), next)).present, s);
});

test('project and SQLite recovery save/load retain all text provenance and independent layers', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { saveProject, loadProject } = await import('../dist-core/projects/project.js');
  const root = await mkdtemp(path.join(tmpdir(), 'text-layer-roundtrip-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let s = editTextLayer(empty(), 'transcript', [cue('Nguồn')], { language: 'vi' });
  s = copy(s, 'transcript', 'spoken');
  s = editTextLayer(s, 'transcript', [cue('Nguồn đã sửa')]);
  const filename = path.join(root, 'saved.reupmatic.json');
  const project = createProject({ path: '/source.mp4', sha256: 'a'.repeat(64) }, s);
  await saveProject(filename, project);
  const restored = await loadProject(filename);
  assert.deepEqual(restored, project);
  assert.equal(getTextLayer(restored, 'spoken').stale, true);
  assert.equal(getTextLayer(restored, 'spoken').cues[0].text, 'Nguồn');
  const { RecoveryStore } = await import('../dist-core/projects/recovery/recovery-store.js');
  let store = new RecoveryStore(path.join(root, 'recovery.sqlite'));
  try {
    assert.equal(store.save('document-001', 0, project).revision, 1);
    store.close();
    store = new RecoveryStore(path.join(root, 'recovery.sqlite'));
    assert.deepEqual(store.load('document-001', 1), project);
  } finally { store.close(); }
});

test('explicit source review clears a stale copy without losing manual words or silently refreshing descendants', async () => {
  const { reviewLayerSource } = await import('../dist-core/subtitles/layers/commands.js');
  let s = editTextLayer(empty(), 'transcript', [cue('Original')]);
  s = copy(s, 'transcript', 'translated');
  s = editTextLayer(s, 'translated', [cue('Manually translated')]);
  s = copy(s, 'translated', 'spoken');
  s = editTextLayer(s, 'transcript', [cue('Corrected source')]);
  const preview = previewLayerCopy(s, 'transcript', 'translated');
  const reviewed = reviewLayerSource(s, preview);
  assert.equal(getTextLayer(reviewed, 'translated').cues[0].text, 'Manually translated');
  assert.equal(getTextLayer(reviewed, 'translated').stale, false);
  assert.equal(getTextLayer(reviewed, 'translated').edited, true);
  assert.equal(getTextLayer(reviewed, 'spoken').stale, true);
  assert.equal(getTextLayer(reviewed, 'spoken').cues[0].text, 'Manually translated');
  assert.equal(getTextLayer(reviewed, 'translated').origin.token, getTextLayer(reviewed, 'transcript').token);
  assert.throws(() => reviewLayerSource(reviewed, preview), /STALE_OPERATION/);
  assert.throws(() => reviewLayerSource(editTextLayer(s, 'transcript', [cue('Changed again')]), preview), /STALE_OPERATION/);
});


test('keeping reviewed manual text does not require capacity for an unwanted replacement', async () => {
  const { reviewLayerSource } = await import('../dist-core/subtitles/layers/commands.js');
  let s = editTextLayer(empty(), 'transcript', [cue('Original')]);
  s = copy(s, 'transcript', 'translated');
  s = editTextLayer(s, 'translated', [cue('Keep this short correction')]);
  const large = Array.from({ length: 65 }, (_, index) => ({
    id: `large-${index}`, start_ms: index * 1000, end_ms: (index + 1) * 1000,
    text: 'x'.repeat(9000),
  }));
  s = editTextLayer(s, 'transcript', large);
  const preview = previewLayerCopy(s, 'transcript', 'translated');
  assert.throws(() => applyLayerCopy(s, preview), /TEXT_LAYERS_TOO_LARGE/);
  const reviewed = reviewLayerSource(s, preview);
  assert.equal(getTextLayer(reviewed, 'translated').cues[0].text, 'Keep this short correction');
  assert.equal(getTextLayer(reviewed, 'translated').stale, false);
});
