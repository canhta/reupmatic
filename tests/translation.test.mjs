import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createProject, parseProject } from '../dist-core/projects/project.js';
import {
  parseTranslationInput,
  parseTranslationStatus,
  validateTranslationResult,
} from '../dist-core/speech/translation/contracts.js';
import { TranslationCoordinator } from '../dist-core/speech/translation/coordinator.js';
import {
  applyTranslation,
  prepareTranslation,
  previewTranslation,
} from '../dist-core/speech/translation/review.js';
import {
  applyLayerCopy,
  editTextLayer,
  previewLayerCopy,
  reviewLayerSource,
} from '../dist-core/subtitles/layers/commands.js';
import { getTextLayer, parseTextLayers } from '../dist-core/subtitles/layers/document.js';
import { defaultSubtitleStyle } from '../dist-core/subtitles/style.js';

const model = 'a'.repeat(64);
const cue = (id, text, start = 0) => ({ id, text, start_ms: start, end_ms: start + 1000 });
function document() {
  let doc = {
    cues: [cue('display-1', 'Displayed unchanged')],
    sample: { start_ms: 0, end_ms: 3000 },
  };
  doc = editTextLayer(doc, 'transcript', [cue('one', 'Hello'), cue('two', 'World', 1000)], {
    language: 'en',
  });
  return editTextLayer(doc, 'spoken', [cue('voice', 'Voice unchanged')], { language: 'vi' });
}
function input(doc = document()) {
  return prepareTranslation(doc, {
    request_id: 'translate-12345678',
    revision: 2,
    source_layer: 'transcript',
    source_language: 'en',
    target_language: 'vi',
    model_id: model,
    rules: [{ find: 'Xin', replace: 'Kính' }],
  });
}
function result(request) {
  return {
    kind: 'translation',
    ...request.params,
    runtime: 'controlled-test',
    cues: request.params.cues.map((c, index) => ({ ...c, text: index ? 'Thế giới' : 'Kính chào' })),
  };
}

test('translation requests snapshot explicit languages, source token, cues and literal rules', () => {
  const doc = document(),
    request = input(doc);
  assert.deepEqual(parseTranslationInput(request), request);
  for (const patch of [
    { source_language: ['en'] },
    { target_language: 'en' },
    { model_id: 'remote' },
    { source_layer: 'translated' },
    { rules: [{ find: '', replace: 'x' }] },
    { path: '/private' },
    { cues: [] },
    { cues: [cue('empty', '  ')] },
    { cues: [cue('long', 'a'.repeat(4001))] },
  ]) {
    assert.throws(() =>
      parseTranslationInput({ ...request, params: { ...request.params, ...patch } }),
    );
  }
  assert.throws(
    () =>
      prepareTranslation(doc, {
        ...request.params,
        request_id: request.request_id,
        revision: 2,
        source_language: 'zh',
      }),
    /TRANSLATION_LANGUAGE_MISMATCH/,
  );
  request.params.cues[0].text = 'Mutated request';
  assert.equal(getTextLayer(doc, 'transcript').cues[0].text, 'Hello');
});

test('translation responses cannot change source correlation, IDs, timing, count or rules', () => {
  const request = input(),
    good = result(request);
  assert.deepEqual(validateTranslationResult(good, request), good);
  for (const patch of [
    { source_token: 'other-token' },
    { target_language: 'en' },
    { model_id: 'b'.repeat(64) },
    { rules: [] },
    { cues: [] },
    { cues: [...good.cues].reverse() },
    { cues: good.cues.map((c) => ({ ...c, end_ms: c.end_ms + 1 })) },
    { cues: good.cues.map((c) => ({ ...c, style: {} })) },
    { command: 'download' },
  ]) {
    assert.throws(
      () => validateTranslationResult({ ...good, ...patch }, request),
      /INVALID_WORKER_RESPONSE/,
    );
  }
});

test('preview is pure; default apply retains every existing translation and other text layers', () => {
  let doc = document();
  doc = editTextLayer(
    doc,
    'translated',
    [cue('one', 'Sửa tay'), cue('extra', 'Giữ đoạn riêng', 2000)],
    { language: 'vi' },
  );
  const request = input(doc),
    before = structuredClone(doc);
  const preview = previewTranslation(doc, request, result(request), 'keep-existing');
  assert.deepEqual(doc, before);
  assert.equal(preview.kept, 2);
  assert.equal(preview.added, 1);
  const next = applyTranslation(doc, preview);
  assert.deepEqual(getTextLayer(next, 'translated').cues, [
    cue('one', 'Sửa tay'),
    cue('two', 'Thế giới', 1000),
    cue('extra', 'Giữ đoạn riêng', 2000),
  ]);
  for (const name of ['displayed', 'spoken', 'transcript'])
    assert.deepEqual(getTextLayer(next, name), getTextLayer(doc, name));
  assert.equal(next.text_layers.translated.edited, true);
  assert.equal(next.text_layers.translated.origin.kind, 'translation');
  assert.deepEqual(next.text_layers.translated.origin.rules, request.params.rules);
});

test('whole replacement is explicit and target edits after preview invalidate it', () => {
  const doc = editTextLayer(document(), 'translated', [cue('old', 'Manual')], { language: 'vi' });
  const request = input(doc),
    preview = previewTranslation(doc, request, result(request), 'replace-all');
  const next = applyTranslation(doc, preview);
  assert.deepEqual(getTextLayer(next, 'translated').cues, result(request).cues);
  assert.deepEqual(getTextLayer(doc, 'translated').cues, [cue('old', 'Manual')]);
  const edited = editTextLayer(doc, 'translated', [cue('old', 'New manual words')]);
  assert.throws(() => applyTranslation(edited, preview), /STALE_OPERATION/);
  assert.throws(() => applyTranslation(doc, { ...preview, cues: [] }), /STALE_OPERATION/);
});

test('changed source cannot be rebased into a generated draft; target-only edits may be reviewed separately', () => {
  const doc = document(),
    request = input(doc),
    translated = result(request);
  const changedSource = editTextLayer(doc, 'transcript', [cue('one', 'Different source')]);
  assert.throws(
    () => previewTranslation(changedSource, request, translated, 'keep-existing'),
    /STALE_OPERATION/,
  );
  const changedTarget = editTextLayer(doc, 'translated', [cue('one', 'Manual')], {
    language: 'vi',
  });
  assert.equal(previewTranslation(changedTarget, request, translated, 'keep-existing').kept, 1);
});

test('upstream edits stale translation and copies without replacing words; explicit source review retains provenance', () => {
  const doc = document(),
    request = input(doc);
  let next = applyTranslation(
    doc,
    previewTranslation(doc, request, result(request), 'replace-all'),
  );
  next = applyLayerCopy(next, previewLayerCopy(next, 'translated', 'spoken'));
  const before = structuredClone(next.text_layers.translated.cues);
  next = editTextLayer(next, 'transcript', [cue('one', 'Changed source')], { language: 'en' });
  assert.equal(next.text_layers.translated.stale, true);
  assert.equal(next.text_layers.spoken.stale, true);
  const reviewed = reviewLayerSource(next, previewLayerCopy(next, 'transcript', 'translated'));
  assert.deepEqual(reviewed.text_layers.translated.cues, before);
  assert.equal(reviewed.text_layers.translated.stale, false);
  assert.equal(reviewed.text_layers.translated.origin.kind, 'translation');
  assert.equal(reviewed.text_layers.spoken.stale, true);
});

test('translation rejects a source derived from translated text and prevents mixed-language preservation', () => {
  let doc = document();
  doc = editTextLayer(doc, 'translated', [cue('one', 'Bonjour')], { language: 'zh' });
  const request = input(doc);
  assert.throws(
    () => previewTranslation(doc, request, result(request), 'keep-existing'),
    /TRANSLATION_TARGET_LANGUAGE_MISMATCH/,
  );
  assert.equal(previewTranslation(doc, request, result(request), 'replace-all').cues.length, 2);
  doc = applyLayerCopy(doc, previewLayerCopy(doc, 'translated', 'displayed'));
  assert.throws(
    () =>
      prepareTranslation(doc, {
        request_id: 'cycle-12345678',
        revision: 2,
        source_layer: 'displayed',
        source_language: 'zh',
        target_language: 'vi',
        model_id: model,
        rules: [],
      }),
    /TEXT_LAYER_CYCLE/,
  );
});

test('translation provenance roundtrips current projects; unsupported text/project formats fail', () => {
  const doc = document(),
    request = input(doc);
  const next = applyTranslation(
    doc,
    previewTranslation(doc, request, result(request), 'replace-all'),
  );
  const project = createProject({ path: '/source.mp4', sha256: model }, next);
  assert.equal(project.version, 5);
  assert.equal(project.text_layers.version, 2);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))), project);
  assert.throws(() => parseProject({ ...project, version: 4 }), /PROJECT_VERSION/);
  assert.throws(() => parseTextLayers({ ...next.text_layers, version: 1 }), /INVALID_TEXT_LAYERS/);
});

class Port extends EventEmitter {
  request(method, params, _revision) {
    this.method = method;
    this.params = params;
    this.result = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    return {
      id: 'worker-1',
      result: this.result,
      cancel: async () => {
        this.cancelled = true;
      },
    };
  }
}

test('translation uses the same worker queue, correlates progress and rejects duplicate requests', async () => {
  const port = new Port(),
    coordinator = new TranslationCoordinator(port),
    events = [],
    request = input();
  coordinator.on('job', (message) => events.push(message));
  const ticket = coordinator.start(request);
  assert.equal(port.method, 'speech.translate');
  port.emit('message', {
    v: 1,
    id: 'worker-1',
    revision: 2,
    event: 'progress',
    data: { phase: 'translationRunning', fraction: 0.5 },
  });
  port.resolve(result(request));
  assert.deepEqual(await ticket.result, result(request));
  assert.equal(events.at(-1).id, request.request_id);
  assert.equal(events.at(-1).event, 'result');
  assert.equal(coordinator.activeCount, 0);
  assert.throws(() => coordinator.start(request), /DUPLICATE_REQUEST/);
  await coordinator.close();
});

test('cancellation discards a late translation without publishing it', async () => {
  const port = new Port(),
    coordinator = new TranslationCoordinator(port),
    request = input(),
    events = [];
  coordinator.on('job', (message) => events.push(message));
  const ticket = coordinator.start(request);
  await ticket.cancel();
  assert.equal(port.cancelled, true);
  port.resolve(result(request));
  await assert.rejects(ticket.result, /CANCELLED/);
  assert.equal(
    events.some((e) => e.event === 'result'),
    false,
  );
  await coordinator.close();
});

test('translation capability discovery never claims hash verification', () => {
  const value = {
    available: true,
    code: null,
    model_id: model,
    source_language: 'en',
    target_language: 'vi',
    verified: false,
  };
  assert.deepEqual(parseTranslationStatus(value), value);
  for (const patch of [
    { source_language: 'auto' },
    { verified: true },
    { target_language: 'en' },
    { model_id: null },
  ]) {
    assert.throws(() => parseTranslationStatus({ ...value, ...patch }), /INVALID_WORKER_RESPONSE/);
  }
});

test('one translation application has complete document undo and redo', async () => {
  const { openEditorHistory, changeEditor, undoEditor, redoEditor } = await import(
    '../dist-core/projects/editor-history.js'
  );
  const doc = document(),
    request = input(doc);
  const applied = applyTranslation(doc, previewTranslation(doc, request, result(request)));
  const history = changeEditor(openEditorHistory(doc), applied);
  assert.equal(history.past.length, 1);
  const undone = undoEditor(history);
  assert.deepEqual(undone.present, doc);
  assert.deepEqual(redoEditor(undone).present, applied);
  assert.deepEqual(applied.cues, doc.cues);
  assert.deepEqual(applied.text_layers.spoken, doc.text_layers.spoken);
});

test('cut/speed changes rebase translation provenance and keep independently translated words', async () => {
  const { editCompositionSnapshot } = await import('../dist-core/editing/composition/snapshot.js');
  let doc = document();
  doc.composition = {
    version: 1,
    canvas: { width: 320, height: 180, fps: 30 },
    clips: [
      {
        id: 'clip-a',
        source: { path: '/source.mp4', name: 'source.mp4', sha256: model, duration_ms: 4000 },
        start_ms: 0,
        end_ms: 4000,
        speed: 1,
      },
    ],
  };
  const request = input(doc);
  doc = applyTranslation(doc, previewTranslation(doc, request, result(request)));
  const edited = editCompositionSnapshot(doc, [
    { kind: 'update', id: 'clip-a', start_ms: 0, end_ms: 2000, speed: 2 },
  ]);
  assert.deepEqual(
    edited.text_layers.translated.cues.map((c) => [c.text, c.start_ms, c.end_ms]),
    doc.text_layers.translated.cues.map((c) => [c.text, c.start_ms / 2, c.end_ms / 2]),
  );
  assert.equal(edited.text_layers.translated.stale, false);
  assert.equal(edited.text_layers.translated.origin.token, edited.text_layers.transcript.token);
  for (const key of [
    'model_id',
    'rules',
    'source_language',
    'target_language',
    'runtime',
    'request_id',
  ]) {
    assert.deepEqual(
      edited.text_layers.translated.origin[key],
      doc.text_layers.translated.origin[key],
    );
  }
  assert.throws(() => previewTranslation(edited, request, result(request)), /STALE_OPERATION/);
});

test('saved projects and reopened SQLite recovery retain translated manual edits and provenance', async (t) => {
  const { mkdtemp, rm, readFile, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { saveProject, loadProject } = await import('../dist-core/projects/project.js');
  const { RecoveryStore } = await import('../dist-core/projects/recovery/recovery-store.js');
  const root = await mkdtemp(path.join(tmpdir(), 'translated-project-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.mp4');
  await writeFile(source, 'UNCHANGED ORIGINAL');
  let doc = editTextLayer(document(), 'translated', [cue('one', 'Bản sửa riêng', 300)], {
    language: 'vi',
  });
  const request = input(doc);
  doc = applyTranslation(doc, previewTranslation(doc, request, result(request)));
  const project = createProject({ path: source, sha256: model }, doc),
    filename = path.join(root, 'project.reupmatic.json');
  await saveProject(filename, project);
  assert.deepEqual(await loadProject(filename), project);
  let store = new RecoveryStore(path.join(root, 'recovery.sqlite'));
  try {
    store.save('translation-doc', 0, project);
    store.close();
    store = new RecoveryStore(path.join(root, 'recovery.sqlite'));
    assert.deepEqual(store.load('translation-doc', 1), project);
    assert.equal(
      store.load('translation-doc', 1).text_layers.translated.cues[0].text,
      'Bản sửa riêng',
    );
  } finally {
    store.close();
  }
  const old = { ...project, version: 4 };
  await writeFile(filename, JSON.stringify(old));
  const before = await readFile(filename);
  await assert.rejects(loadProject(filename), /PROJECT_VERSION/);
  assert.deepEqual(await readFile(filename), before);
  assert.equal(await readFile(source, 'utf8'), 'UNCHANGED ORIGINAL');
});

test('translation progress cannot inject captured input, unknown phases or invalid fractions', async () => {
  const port = new Port(),
    coordinator = new TranslationCoordinator(port),
    request = input(),
    events = [];
  coordinator.on('job', (message) => events.push(message));
  const ticket = coordinator.start(request);
  const event = (data) => ({
    v: 1,
    id: 'worker-1',
    revision: request.revision,
    event: 'progress',
    data,
  });
  for (const data of [
    { phase: 'translationRunning', fraction: 2 },
    { phase: 'foreign', fraction: 0.5 },
    { phase: 'running', fraction: 0.5, input: 'injected' },
    { phase: 'running', fraction: NaN },
  ])
    port.emit('message', event(data));
  port.emit('message', {
    ...event({ phase: 'running', fraction: null }),
    revision: request.revision + 1,
  });
  assert.equal(events.length, 0);
  port.emit('message', event({ phase: 'translationRunning', fraction: 0.5 }));
  assert.equal(events.length, 1);
  assert.equal(events[0].id, request.request_id);
  port.resolve(result(request));
  await ticket.result;
  await coordinator.close();
  assert.equal(port.listenerCount('message'), 0);
  assert.throws(() => coordinator.start({ ...request, request_id: 'another-id' }), /WORKER_EXITED/);
});

test('browser-facing translation modules have no Node value imports', async () => {
  const { readFile } = await import('node:fs/promises');
  const seen = new Set();
  async function visit(url) {
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const source = await readFile(url, 'utf8');
    for (const [, dependency] of source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      assert.ok(!dependency.startsWith('node:'), `${url.pathname}: ${dependency}`);
      if (dependency.startsWith('.')) await visit(new URL(dependency, url));
    }
  }
  await visit(new URL('../dist-core/speech/translation/review.js', import.meta.url));
  assert.ok(seen.size > 5);
});

test('displayed source strips presentation and style-only edits do not invalidate a captured translation', () => {
  let doc = document();
  doc = editTextLayer(
    doc,
    'displayed',
    [{ ...cue('display', 'Hello'), style: { ...defaultSubtitleStyle, font_size_pct: 3 } }],
    { language: 'en' },
  );
  const request = prepareTranslation(doc, {
    request_id: 'displayed-request',
    revision: 7,
    source_layer: 'displayed',
    source_language: 'en',
    target_language: 'vi',
    model_id: model,
    rules: [],
  });
  assert.equal('style' in request.params.cues[0], false);
  const token = doc.text_layers.displayed.token;
  doc = editTextLayer(doc, 'displayed', [
    { ...doc.cues[0], style: { ...defaultSubtitleStyle, font_size_pct: 4.4 } },
  ]);
  assert.equal(doc.text_layers.displayed.token, token);
  const output = {
    ...request.params,
    kind: 'translation',
    runtime: 'controlled@1',
    cues: request.params.cues.map((c) => ({ ...c, text: 'Xin chào' })),
  };
  const translated = applyTranslation(doc, previewTranslation(doc, request, output));
  assert.equal(translated.cues[0].style.font_size_pct, 4.4);
  assert.equal(translated.text_layers.translated.cues[0].text, 'Xin chào');
  assert.equal(translated.text_layers.translated.origin.layer, 'displayed');
});
