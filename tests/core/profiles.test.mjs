import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceCatalog } from '../../dist-core/catalog/workspace-catalog.js';
import {
  applyProfileProcessing,
  parseProfileDocument,
} from '../../dist-core/profiles/profile-document.js';

async function unusedExport() {
  throw new Error('UNUSED_EXPORT');
}

const profile = {
  id: 'profile_001',
  expected_revision: null,
  name: 'Tiếng Việt',
  notes: 'Keep accents',
  processing: null,
  archived: false,
};

test('SC-03: optional data-only profiles round trip without user media, cues or identity', () => {
  const catalog = new WorkspaceCatalog(':memory:', unusedExport);
  try {
    catalog.saveProfile(profile);
    const document = catalog.getProfileDocument(profile.id);
    assert.deepEqual(parseProfileDocument(JSON.parse(JSON.stringify(document))), document);
    assert.equal(document.processing, null);
    assert.equal(document.name, 'Tiếng Việt');
    assert.equal(Object.hasOwn(document, 'id'), false);
    assert.throws(
      () => parseProfileDocument({ ...document, source: '/private/video.mp4' }),
      /INVALID_REQUEST/,
    );
    // Project media (ticket 03) never rides along in a profile: a profile is
    // one processing recipe, not a document's files.
    assert.throws(
      () =>
        parseProfileDocument({
          ...document,
          media: [{ id: 'media_001', kind: 'video', path: '/v.mp4', name: 'v.mp4' }],
        }),
      /INVALID_REQUEST/,
    );
    assert.throws(() => catalog.saveProfile(profile), /REVISION_CONFLICT/);
  } finally {
    catalog.close();
  }
});

test('SC-03: reusable profiles reject video-specific removal masks', () => {
  const catalog = new WorkspaceCatalog(':memory:', unusedExport);
  try {
    const processing = {
      inpaint: {
        target: 'manual',
        padding_px: 4,
        region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      },
    };
    assert.throws(() => catalog.saveProfile({ ...profile, processing }), /PROFILE_MEDIA_SPECIFIC/);
  } finally {
    catalog.close();
  }
});

test('SC-03: reusable profiles retain video/audio edits and reject source-specific trim', () => {
  const catalog = new WorkspaceCatalog(':memory:', unusedExport);
  try {
    const processing = {
      editing: {
        speed: 1.25,
        rotate: 90,
        fade: { in_ms: 500, out_ms: 250, audio: true },
        audio: { muted: false, gain_db: -3 },
        output: { aspect: '9:16', fit: 'contain', height: 1080 },
      },
    };
    catalog.saveProfile({ ...profile, processing });
    assert.deepEqual(catalog.getProfileDocument(profile.id).processing, processing);
    assert.throws(
      () =>
        catalog.saveProfile({
          ...profile,
          id: 'profile_002',
          processing: {
            ...processing,
            editing: { ...processing.editing, trim: { start_ms: 0, end_ms: 1000 } },
          },
        }),
      /PROFILE_MEDIA_SPECIFIC/,
    );
    assert.equal(catalog.listProfiles().length, 1);
  } finally {
    catalog.close();
  }
});

const LOGO = {
  media_id: 'media_00000001',
  anchor: 'top-left',
  margin: 0.04,
  scale: 0.2,
  opacity: 0.8,
};

test('D-63: a profile omits the per-project logo and keeps the rest', () => {
  const logoOnly = {
    format: 'reupmatic.processing-profile',
    name: 'Logo mark',
    notes: '',
    processing: { editing: { logo: LOGO } },
  };
  // A placement that named project media would render nothing elsewhere, so the
  // saved profile drops it; a logo-only recipe leaves no processing at all.
  assert.equal(parseProfileDocument(logoOnly).processing, null);
  const mixed = {
    ...logoOnly,
    processing: { editing: { speed: 1.25, logo: LOGO } },
  };
  assert.deepEqual(parseProfileDocument(mixed).processing, { editing: { speed: 1.25 } });
});

test('D-63: applying a profile leaves the project logo untouched', () => {
  const project = {
    editing: {
      logo: { anchor: 'bottom-right', margin: 0.04, scale: 0.2, opacity: 1 },
      speed: 1,
    },
  };
  // The profile carries no logo: the project's own placement survives.
  assert.deepEqual(applyProfileProcessing({ editing: { rotate: 90 } }, project), {
    editing: {
      rotate: 90,
      logo: { anchor: 'bottom-right', margin: 0.04, scale: 0.2, opacity: 1 },
    },
  });
  // A null profile still keeps the project's logo.
  assert.deepEqual(applyProfileProcessing(null, project), {
    editing: { logo: { anchor: 'bottom-right', margin: 0.04, scale: 0.2, opacity: 1 } },
  });
  assert.equal(applyProfileProcessing(null, undefined), undefined);
});
