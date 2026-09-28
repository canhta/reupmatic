import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(filename) : [filename];
  });
}

// D-63 removed the header's "Open video…" / "From Library…" entries and the
// File > Open Video… item (with its ⌘O binding): media is added into the open
// project through Project media Add… / File > Import Media… / dropping a file.
// A locale string or menu label that still names the removed command, or shows
// its now-unbound shortcut, is stale copy — this fails so it can't come back.
const REMOVED_COMMANDS = [
  { label: 'Open video', pattern: /Open video/ },
  { label: 'Open Video', pattern: /Open Video/ },
  { label: 'Mở video', pattern: /Mở video/ },
  { label: 'From Library…', pattern: /From Library…/ },
  { label: 'Từ Thư viện…', pattern: /Từ Thư viện…/ },
  { label: '⌘O', pattern: /⌘O/ },
  { label: 'CmdOrCtrl+O', pattern: /CmdOrCtrl\+O/ },
  { label: 'Cmd+O', pattern: /Cmd\+O/ },
  { label: 'Ctrl+O', pattern: /Ctrl\+O/ },
];

test('no UI string, menu label or e2e spec names a command D-63 removed', () => {
  const files = [
    ...filesBelow(path.join(root, 'app/ui/locales/en')).filter((file) => file.endsWith('.ts')),
    ...filesBelow(path.join(root, 'app/ui/locales/vi')).filter((file) => file.endsWith('.ts')),
    path.join(root, 'app/electron/runtime/messages.ts'),
    ...readdirSync(path.join(root, 'tests/e2e'))
      .filter((name) => name.endsWith('.mjs'))
      .map((name) => path.join(root, 'tests/e2e', name)),
  ];
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { label, pattern } of REMOVED_COMMANDS) {
      if (pattern.test(source)) offenders.push(`${path.relative(root, file)}: ${label}`);
    }
  }
  assert.deepEqual(offenders, [], `Stale copy for removed commands: ${offenders.join(', ')}`);
});
