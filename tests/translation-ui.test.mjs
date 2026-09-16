// Source guards only: these checks do not render Electron or certify keyboard/IME behavior.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const ui = (name) => read(`app/ui/features/speech/translation/${name}`);

test('translation has matching typed preload/host channels and participates in close cancellation', () => {
  const bridge = read('app/ui/bridge.d.ts'),
    preload = read('app/electron/preload.cts');
  const host = read('app/electron/features/speech/translation/ipc.ts');
  for (const [method, channel] of [
    ['translationStatus', 'translation-status'],
    ['translationStart', 'translation-start'],
    ['translationCancel', 'translation-cancel'],
    ['translationConfigure', 'translation-configure'],
    ['translationCancelSetup', 'translation-cancel-setup'],
  ]) {
    assert.match(bridge, new RegExp(`${method}\\(`));
    assert.match(preload, new RegExp(`${method}:.*'${channel}'`));
    assert.match(host, new RegExp(`host.wire\\('${channel}'`));
  }
  for (const method of ['onTranslationJob', 'onTranslationModelsChanged'])
    assert.match(bridge, new RegExp(`${method}\\(`));
  assert.match(host, /dialog\.showOpenDialog/);
  assert.match(read('app/electron/main.ts'), /translation\.close\(\)/);
  assert.match(read('app/electron/main.ts'), /translation\.activeCount/);
  assert.match(host, /new TranslationCoordinator\(host.worker\)/);
});

test('draft review exposes manual keep, explicit replacement, all rows and final timings', () => {
  const source = ui('TranslationReview.tsx');
  assert.match(source, /useState<TranslationPolicy>\('keep-existing'\)/);
  assert.match(source, /value="replace-all"/);
  assert.match(source, /requiresConfirmation && !confirmed/);
  assert.match(source, /<CheckboxInput[^>]*value={confirmed}/);
  assert.doesNotMatch(source, /checked={confirmed}/);
  assert.match(source, /ids\.slice\(page \* 25/);
  assert.match(source, /translationPrevious/);
  assert.match(source, /translationNext/);
  assert.match(source, /translationFinalTime/);
  assert.match(source, /new Map\(p\.cues\.map\(\(?cue\)? => \[cue\.id, cue\]\)/);
  assert.match(source, /editor\.applyTranslation\(preview.value, preview.revision\)/);
  assert.match(source, /preview.revision === editor.revision/);
});

test('translation hook retains draft on failed retry and does not apply from job events', () => {
  const source = ui('useTranslationJob.ts');
  assert.doesNotMatch(source, /applyTranslation\(|setDraft\(null\)/);
  assert.match(source, /validateTranslationResult\(message.data, request.input\)/);
  assert.match(source, /message.revision !== request.input.revision/);
  assert.match(source, /request.documentId !== current.current.documentId/);
  assert.match(source, /translationCancel\(request.input.request_id\)/);
  assert.match(source, /operation.current\?\.input.request_id === request.input.request_id/);
  const editor = read('app/ui/features/editor/useEditorModel.ts');
  assert.match(editor, /applyTranslatedDraft\(/);
  assert.match(editor, /expectedRevision !== rev.current/);
  assert.match(
    read('app/ui/features/editor/EditorWorkspace.tsx'),
    /<TranslationPanel key={`translation-\${editor.documentId}`}/,
  );
});

test('translation rule/setup forms use existing library primitives without starting work on selection', () => {
  const panel = ui('TranslationPanel.tsx'),
    rules = ui('TranslationRules.tsx');
  assert.match(panel, /pairAvailable/);
  assert.match(panel, /languageMismatch/);
  assert.match(panel, /translationLimits/);
  assert.match(panel, /translationPairMissing/);
  assert.match(panel, /onClick=\{\(\) =>\s*void job\.start/);
  assert.doesNotMatch(panel, /useEffect|fetch\(|new Worker|\.render\(/);
  assert.doesNotMatch(rules, /window.reupmatic|useEffect|RegExp|new Worker/);
  assert.match(rules, /rules.length >= 50/);
  for (const name of ['TextInput', 'Button', 'Collapsible'])
    assert.match(rules, new RegExp(`core/${name}`));
});

test('dynamic translation phases/errors and capture consequences are bilingual and documented', () => {
  const resources = ui('i18n.ts');
  const [en, vi] = resources.split('export const translationVi:');
  for (const key of [
    'translationRunning',
    'translationSourceChanged',
    'translationTargetMismatch',
    'translationTruncated',
    'translationCapturedHelp',
    'translationConfirm',
    'translationStaleHelp',
  ]) {
    for (const source of [en, vi]) assert.match(source, new RegExp(`\\b${key}:`));
  }
  assert.match(read('docs/development/local-translation.md'), /session-only/);
  assert.match(read('specs/local-translation.md'), /not complete the speech pipeline/);
});
