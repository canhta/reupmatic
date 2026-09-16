import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (filename) => readFile(new URL(`../${filename}`, import.meta.url), 'utf8');

test('voice UI keeps explicit generation, library controls and no document mutation', async () => {
  const panel = await source('app/ui/features/speech/synthesis/SynthesisPanel.tsx');
  const review = await source('app/ui/features/speech/synthesis/SynthesisReview.tsx');
  assert.match(panel, /job\.start\(\{\s*language,\s*voice_id:\s*voice/);
  assert.match(panel, /editor\.activeTextLayer === 'spoken'/);
  assert.match(panel, /scope === 'selected'/);
  assert.match(panel, /@astryxdesign\/core\/Section/);
  assert.match(review, /@astryxdesign\/core\/Table/);
  assert.match(review, /@astryxdesign\/core\/CheckboxInput/);
  assert.match(review, /<audio\s+controls\s+preload="metadata"/);
  assert.doesNotMatch(panel + review, /<(?:button|input|select|textarea)\b/);
  assert.doesNotMatch(panel + review, /editor\.(?:change|apply|setSoundtrack|render)\w*\(/);
  assert.match(review, /!heard \|\| !reviewed/);
  assert.match(review, /result\.segments\[page \* 25 \+ index\]/);
});

test('source rechecked across native dialogs, cancellation suppresses late preview', async () => {
  const review = await source('app/ui/features/speech/synthesis/SynthesisReview.tsx');
  const choose = review.indexOf('window.reupmatic.synthesisChooseExport');
  const save = review.indexOf('window.reupmatic.synthesisSave');
  assert.ok(choose < save);
  assert.match(review.slice(choose, save), /assertCurrent\(\)/);
  assert.match(review.slice(choose, save), /aborted\.current/);
  assert.match(review, /synthesisCancelExport/);
  assert.match(review, /assertSynthesisCurrent\(current\.current\.textSnapshot, draft\.input\)/);
  assert.match(review, /onPlay=\{\(\) => setHeard\(true\)\}/);
});

test('draft correlation survives failed retries and ignores late job acknowledgements', async () => {
  const hook = await source('app/ui/features/speech/synthesis/useSynthesisJob.ts');
  assert.match(hook, /message\.id !== request\.input\.request_id/);
  assert.match(hook, /message\.revision !== request\.input\.revision/);
  assert.match(hook, /request\.documentId !== current\.current\.documentId/);
  assert.match(hook, /admitted && operation\.current\?\.input\.request_id !== requestId/);
  assert.match(hook, /request\.phase === 'cancelling'/);
  assert.doesNotMatch(hook, /setDraft\(null\)/);
  assert.match(hook, /synthesisCancel\(request\.input\.request_id\)/);
  assert.match(hook, /synthesisCancelSetup/);
});

test('native synthesis boundary exposes allowlisted verbs, not arbitrary paths', async () => {
  const ipc = await source('app/electron/features/speech/synthesis/ipc.ts');
  const exports = await source('app/electron/features/speech/synthesis/exports.ts');
  const main = await source('app/electron/main.ts');
  assert.match(ipc, /new SynthesisCoordinator\(host\.worker, artifacts\)/);
  assert.match(exports, /dialog\.showSaveDialog/);
  assert.match(exports, /choices\.delete\(id\)/);
  assert.match(exports, /choice\.artifact !== artifactId/);
  assert.match(exports, /host\.media\.originalPaths/);
  assert.doesNotMatch(exports, /p\.(?:path|filename|directory)/);
  assert.match(main, /synthesis\.activeCount/);
  assert.match(main, /synthesis\.close\(\)/);
});

test('EN/VI voice strings cover all task keys and truthful non-alignment language', async () => {
  const strings = await source('app/ui/features/speech/synthesis/i18n.ts');
  const [en, vi] = strings.split('export const synthesisVi:');
  const keys = (text) => [...text.matchAll(/\b(synthesis\w+):\s*'/g)].map((x) => x[1]).sort();
  assert.deepEqual(keys(en), keys(vi));
  assert.match(strings, /not alignment/);
  assert.match(strings, /chưa căn thời gian/);
  const components = await Promise.all(
    ['SynthesisPanel', 'SynthesisReview'].map((name) =>
      source(`app/ui/features/speech/synthesis/${name}.tsx`),
    ),
  );
  for (const text of components)
    for (const match of text.matchAll(/t\('(synthesis\w+)'/g))
      assert.ok(keys(en).includes(match[1]), match[1]);
});
