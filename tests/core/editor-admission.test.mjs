import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAdmitted, isCurrentRevision } from '../../dist-core/projects/editor-admission.js';

test('isCurrentRevision matches only the exact expected revision', () => {
  assert.equal(isCurrentRevision(3, 3), true);
  assert.equal(isCurrentRevision(3, 2), false);
  assert.equal(isCurrentRevision(0, 0), true);
});

test('assertAdmitted allows a current, non-busy operation', () => {
  assert.doesNotThrow(() => assertAdmitted(3, 3, false));
});

test('assertAdmitted rejects a stale revision even when not busy', () => {
  assert.throws(() => assertAdmitted(4, 3, false), /STALE_OPERATION/);
});

test('assertAdmitted rejects a busy operation on the current revision', () => {
  assert.throws(() => assertAdmitted(3, 3, true), /EDITOR_BUSY/);
});

test('assertAdmitted reports staleness before busyness when both apply', () => {
  assert.throws(() => assertAdmitted(4, 3, true), /STALE_OPERATION/);
});
