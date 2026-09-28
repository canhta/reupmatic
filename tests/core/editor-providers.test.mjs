import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

// The Export dialog lives in the app toolbar and opens the Edit tool, so the tool context must wrap
// the toolbar as well as the workspace; mounting it inside EditorWorkspace crashed the toolbar.
test('the editor tool context wraps both the app toolbar and the workspace', () => {
  const app = read('app/ui/App.tsx');
  const open = app.indexOf('<EditorToolsProvider>');
  const close = app.indexOf('</EditorToolsProvider>');
  assert.ok(open >= 0 && close > open, 'App mounts EditorToolsProvider');
  for (const child of ['<EditorToolbarActions', '<EditorWorkspace']) {
    const at = app.indexOf(child);
    assert.ok(at > open && at < close, `${child} renders inside EditorToolsProvider`);
  }
  assert.doesNotMatch(
    read('app/ui/features/editor/EditorWorkspace.tsx'),
    /<EditorToolsProvider>/,
    'one tool context: the workspace must not mount a second, disconnected provider',
  );
});
