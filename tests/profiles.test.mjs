import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceCatalog } from '../dist-core/catalog/workspace-catalog.js';
import { parseProfileDocument } from '../dist-core/profiles/profile-store.js';
const profile = { id: 'profile_001', expected_revision: null, name: 'Tiếng Việt', notes: 'Keep accents', processing: null, archived: false };

test('SC-03: optional data-only profiles round trip without user media, cues or identity', () => {
  const catalog = new WorkspaceCatalog(':memory:');
  try {
    catalog.profiles.save(profile);
    const document = catalog.profiles.document(profile.id);
    assert.deepEqual(parseProfileDocument(JSON.parse(JSON.stringify(document))), document);
    assert.equal(document.processing, null);
    assert.equal(document.name, 'Tiếng Việt');
    assert.equal(Object.hasOwn(document, 'id'), false);
    assert.throws(() => parseProfileDocument({ ...document, source: '/private/video.mp4' }), /INVALID_REQUEST/);
    assert.throws(() => parseProfileDocument({ ...document, version: 99 }), /PROFILE_VERSION/);
    assert.throws(() => catalog.profiles.save(profile), /REVISION_CONFLICT/);
  } finally { catalog.close(); }
});

test('SC-03: reusable profiles reject video-specific removal masks', () => {
  const catalog = new WorkspaceCatalog(':memory:');
  try {
    const processing = { version: 1, inpaint: { target: 'manual', padding_px: 4, region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } } };
    assert.throws(() => catalog.profiles.save({ ...profile, processing }), /PROFILE_MEDIA_SPECIFIC/);
  } finally { catalog.close(); }
});

test('SC-03: reusable profiles retain video/audio edits and reject source-specific trim', () => {
  const catalog = new WorkspaceCatalog(':memory:');
  try {
    const processing = { version: 1, editing: { speed: 1.25, audio: { muted: false, gain_db: -3 },
      output: { aspect: '9:16', fit: 'contain', height: 1080 } } };
    catalog.profiles.save({ ...profile, processing });
    assert.deepEqual(catalog.profiles.document(profile.id).processing, processing);
    assert.throws(() => catalog.profiles.save({ ...profile, id: 'profile_002', processing: {
      ...processing, editing: { ...processing.editing, trim: { start_ms: 0, end_ms: 1000 } },
    } }), /PROFILE_MEDIA_SPECIFIC/);
    assert.equal(catalog.profiles.list().length, 1);
  } finally { catalog.close(); }
});
