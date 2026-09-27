import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ui = path.join(root, 'app/ui');

function tsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(filename);
    return filename.endsWith('.tsx') ? [filename] : [];
  });
}

// Files the drawer refactor does not own yet, or surfaces another worker is editing. Each entry
// records why the file is exempt; an entry is deleted once its slice lands. A trailing `/` matches
// a directory prefix. The drawer refactor owns `design-system/`, the distribution detail drawers,
// the profiles and taxonomy managers, `LibraryDetails`/`SourcesWorkspace`, `batch/` and `JobsTray`.
const ALLOWED = {
  // Voice worker (#28-#36) owns these editor tool-panel contents.
  'features/speech/': 'voice worker owns the speech panels (#28-#36)',
  'features/editor/audio-tools/': 'voice worker owns the audio panels (#28-#36)',
  'features/editor/composition/': 'composition worker owns the composition panels (#37-#42)',
  'features/editor/subtitle-styles/': 'style panel lands in slices 3-11 (#50)',
  'features/editor/text-layers/': 'text-layers panel lands in slices 3-11 (#50)',
  'features/editor/text-rules/': 'text-rules panel lands in slices 3-11 (#50)',
  'features/editor/video-tools/': 'edit panel lands in slices 3-11 (#50)',
  'features/editor/EditorExportDialog.tsx': 'export dialog lands in slice 10 (#50)',
  'features/vision/': 'ocr worker owns the vision panels (#31, #43-#48)',
  'features/processing/': 'shared options land in slices 3-11 (#50)',
  // Subtitles and Media drawers land in slice 11 (#50).
  'features/editor/CuePanel.tsx': 'subtitles drawer lands in slice 11 (#50)',
  'features/editor/ProjectMediaSection.tsx': 'media drawer lands in slice 11 (#50)',
  // Not drawer surfaces.
  'features/automation/': 'not a drawer surface',
  'features/catalog/': 'not a drawer surface',
  'features/folders/': 'not a drawer surface',
  'features/settings/': 'not a drawer surface',
  'features/library/assets/': 'not a drawer surface',
  'features/library/sources/': 'not a drawer surface',
  'features/library/LibraryImportStatus.tsx': 'not a drawer surface',
  'features/library/LibraryFilters.tsx': 'not a drawer surface',
  'features/editor/EditorProjectHeader.tsx': 'not a drawer surface',
  'features/editor/EditorRail.tsx': 'not a drawer surface',
  'features/editor/EditorWorkspace.tsx': 'not a drawer surface',
  'features/editor/MediaStage.tsx': 'not a drawer surface',
  'features/editor/TimelineStrip.tsx': 'not a drawer surface',
  'features/editor/TimeInput.tsx': 'shared control, not a drawer surface',
  'shell/JobsButton.tsx': 'not a drawer surface',
  'shell/LocaleSelect.tsx': 'not a drawer surface',
  'shell/NotificationsButton.tsx': 'not a drawer surface',
  'shell/WorkspaceStatusBar.tsx': 'not a drawer surface',
  // Picker contents other slices own.
  'features/profiles/ProfilePicker.tsx': 'profile picker lands in slices 3-11 (#50)',
  'features/taxonomy/LabelPicker.tsx': 'label picker lands in slices 3-11 (#50)',
};

function isAllowed(relative) {
  if (Object.hasOwn(ALLOWED, relative)) return true;
  return Object.keys(ALLOWED).some((entry) => entry.endsWith('/') && relative.startsWith(entry));
}

function openingTag(source, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') depth++;
    else if (character === '}') depth--;
    else if (character === '>' && depth === 0) return source.slice(start, index + 1);
  }
  return source.slice(start, start + 500);
}

function hasFixedFieldWidth(source) {
  for (const name of ['NumberInput', 'Selector']) {
    for (const match of source.matchAll(new RegExp(`<${name}\\b`, 'g'))) {
      if (/\bwidth=\{(?:[0-9]+|"[0-9]+")\}/.test(openingTag(source, match.index))) return true;
    }
  }
  return false;
}

const CHECKS = {
  'no empty `{}` JSX child': (source) =>
    /^\s*\{\}\s*$/m.test(source) || />\s*\{\}\s*</.test(source),
  'no raw `<code>` in a drawer': (source) => /<\/?code[\s>]/.test(source),
  'no `<Text>` collapsible trigger': (source) => /trigger=\{\s*<Text\b/s.test(source),
  'no fixed NumberInput or Selector width': hasFixedFieldWidth,
  'no supporting text outside the allow-list': (source) => /type="supporting"/.test(source),
};

for (const [name, fails] of Object.entries(CHECKS)) {
  test(`drawer guard: ${name}`, () => {
    const offenders = [];
    for (const file of tsxFiles(ui)) {
      const relative = path.relative(ui, file);
      if (isAllowed(relative)) continue;
      if (fails(readFileSync(file, 'utf8'))) offenders.push(relative);
    }
    assert.deepEqual(
      offenders,
      [],
      `${name} — fix the file, or allow-list it here with its reason:\n${offenders.join('\n')}`,
    );
  });
}
