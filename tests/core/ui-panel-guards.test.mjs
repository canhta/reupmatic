import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ui = path.join(root, 'app/ui');

// The panel grammar of docs/design/panels.md, enforced across the renderer.

// Every file here renders into an Editor tool drawer, whether or not it imports the kit.
const PANEL_ROOTS = ['features/editor/', 'features/speech/', 'features/vision/'];
const KIT = /from '(?:\.\.?\/)+(?:design-system\/)?Panel(?:Controls)?'/;
const DRAWER = /<(SidePanel|ToolDrawer|WorkspaceDrawer)\b/g;

// Each entry names a file and why it may break the rule. An entry that no longer needs its
// exemption fails the suite, so the lists only shrink.
const COLLAPSIBLE_ALLOWED = {};
const WRAP_ALLOWED = {
  'features/editor/MediaStage.tsx': 'the stage toolbar under the video, not a panel',
  'features/editor/text-layers/CopyLayerDialog.tsx': 'a modal dialog, not a panel',
  'features/editor/text-rules/ShiftTimingDialog.tsx': 'a modal dialog, not a panel',
};
const ROWS_OWNER = 'design-system/Panel.tsx';

function tsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(filename);
    return filename.endsWith('.tsx') ? [filename] : [];
  });
}

const sources = new Map(
  tsxFiles(ui).map((file) => [path.relative(ui, file), readFileSync(file, 'utf8')]),
);

/**
 * The part of a file that is panel content: the whole file when it lives under a panel root or
 * renders the kit; otherwise only its drawer elements (SidePanel, ToolDrawer, WorkspaceDrawer)
 * from the opening tag, footer included, to the matching close.
 */
function panelSource(file, source) {
  if (PANEL_ROOTS.some((dir) => file.startsWith(dir)) || KIT.test(source)) return source;
  let spans = '';
  for (const match of source.matchAll(DRAWER)) {
    const close = source.indexOf(`</${match[1]}>`, match.index);
    spans += source.slice(match.index, close < 0 ? undefined : close);
  }
  return spans;
}

function offenders(fails, allowed, scope = (_file, source) => source) {
  const found = [];
  for (const [file, source] of sources) {
    if (fails(scope(file, source))) found.push(file);
  }
  const unexpected = found.filter((file) => !Object.hasOwn(allowed, file));
  const unneeded = Object.keys(allowed).filter((file) => !found.includes(file));
  return { unexpected, unneeded };
}

test('panel guard: no Collapsible anywhere in the renderer', () => {
  const { unexpected, unneeded } = offenders(
    (source) => /<Collapsible\b/.test(source),
    COLLAPSIBLE_ALLOWED,
  );
  assert.deepEqual(unexpected, [], `Use kit sections instead:\n${unexpected.join('\n')}`);
  assert.deepEqual(unneeded, [], `Delete unneeded allow-list entries: ${unneeded.join(', ')}`);
});

test('panel guard: no wrapping row in a drawer or panel', () => {
  const { unexpected, unneeded } = offenders(
    (source) => /wrap="wrap"/.test(source),
    WRAP_ALLOWED,
    panelSource,
  );
  assert.deepEqual(unexpected, [], `Stack or pair instead:\n${unexpected.join('\n')}`);
  assert.deepEqual(unneeded, [], `Delete unneeded allow-list entries: ${unneeded.join(', ')}`);
});

test('panel guard: label-left rows come only from the kit', () => {
  const { unexpected } = offenders((source) => /direction="horizontal-labels"/.test(source), {
    [ROWS_OWNER]: 'the kit itself',
  });
  assert.deepEqual(unexpected, [], `Use PanelRows:\n${unexpected.join('\n')}`);
});

const CONTROLS_OWNER = 'design-system/PanelControls.tsx';

test('panel guard: overflowing filter bars come only from the kit', () => {
  const { unexpected } = offenders((source) => /<OverflowList\b/.test(source), {
    [CONTROLS_OWNER]: 'FilterBar',
  });
  assert.deepEqual(unexpected, [], `Use FilterBar:\n${unexpected.join('\n')}`);
});

/** A row that truncates a value to one line beside a button is a path row. */
function handRolledPathRow(source) {
  for (const match of source.matchAll(/<PanelRow\b/g)) {
    const close = source.indexOf('</PanelRow>', match.index);
    const row = source.slice(match.index, close < 0 ? undefined : close);
    if (/maxLines=\{1\}/.test(row) && /<Button\b/.test(row)) return true;
  }
  return false;
}

test('panel guard: a read-only row is a ValueRow', () => {
  const { unexpected } = offenders((source) => /<PanelRow\b[^>]*>\s*<Text\b/.test(source), {});
  assert.deepEqual(unexpected, [], `Use ValueRow:\n${unexpected.join('\n')}`);
});

// MetadataList draws its own label column; inside a kit panel facts share the rows' column.
test('panel guard: a kit panel shows facts as ValueRows, not MetadataList', () => {
  const { unexpected } = offenders(
    (source) => KIT.test(source) && /<MetadataList\b/.test(source),
    {},
  );
  assert.deepEqual(unexpected, [], `Use ValueRow in PanelRows:\n${unexpected.join('\n')}`);
});

test('panel guard: path rows come only from the kit', () => {
  const { unexpected } = offenders(handRolledPathRow, { [CONTROLS_OWNER]: 'PathRow' });
  assert.deepEqual(unexpected, [], `Use PathRow:\n${unexpected.join('\n')}`);
});

// A folder picker's choose label names PathRow's Choose…; a bare Button beside loose text is the
// hand-rolled row PathRow replaces.
test('panel guard: an output folder is picked through PathRow', () => {
  const { unexpected } = offenders(
    (source) => /<Button\b[^>]*label=\{t\('batchChooseFolder'\)/.test(source),
    {},
  );
  assert.deepEqual(unexpected, [], `Use PathRow:\n${unexpected.join('\n')}`);
});
