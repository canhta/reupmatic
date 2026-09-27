import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ui = path.join(root, 'app/ui');

function read(...parts) {
  return readFileSync(path.join(ui, ...parts), 'utf8');
}

// A stored translation key is not copy: `publishErrorKey` returns a key, so the render must
// resolve it through `t()` before it reaches the DOM.
test('PostPublication translates the publish error before rendering it', () => {
  const source = read('features/distribution/PostPublication.tsx');
  assert.match(source, /\{t\(error\)\}/, 'the publish error is rendered through t()');
  assert.doesNotMatch(source, /\{error\}/, 'the raw publish error key must not be rendered');
});

// TikTok returns `privacy_level` codes. The Selector must name them through the copy map,
// never echo the code itself.
test('TikTok privacy options are translated, never the raw code', () => {
  const source = read('features/distribution/TikTokPostOptions.tsx');
  assert.match(
    source,
    /t\(tiktokPrivacyKey\(option\)\)/,
    'privacy option labels go through the copy map',
  );
  assert.doesNotMatch(source, /label:\s*option\b/, 'the raw privacy code must not be the label');
  const copy = read('features/distribution/publish-copy.ts');
  for (const code of [
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY',
  ]) {
    assert.match(copy, new RegExp(`\\b${code}:`), `${code} has a copy mapping`);
  }
});

// The saved/exported confirmations were parked in the drawer, which closed before they could
// render. They belong in the notification store, which is visible from any surface.
test('ProfileManager surfaces its confirmations through the notification store', () => {
  const source = read('features/profiles/ProfileManager.tsx');
  assert.match(source, /useNotifications\(\)/, 'ProfileManager raises notifications');
  assert.match(source, /raise\(/, 'a confirmation is raised');
  assert.doesNotMatch(source, /setMessage\(/, 'no confirmation is parked inside the drawer');
});
