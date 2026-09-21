import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldCheckForUpdates } from '../../dist-core/runtime/auto-update-gate.js';

test('only a packaged app pointed at the release feed checks for updates', () => {
  assert.equal(shouldCheckForUpdates({ packaged: true }), true);
  // A dev run, or any build using the dev server, never updates itself.
  assert.equal(shouldCheckForUpdates({ packaged: false }), false);
  assert.equal(
    shouldCheckForUpdates({ packaged: true, devServerUrl: 'http://localhost:5173' }),
    false,
  );
  assert.equal(shouldCheckForUpdates({ packaged: false, devServerUrl: undefined }), false);
});
