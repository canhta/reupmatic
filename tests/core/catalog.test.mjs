import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceCatalog } from '../../dist-core/catalog/workspace-catalog.js';

async function unusedExport() {
  throw new Error('UNUSED_EXPORT');
}

const channel = {
  id: 'channel_001',
  expected_revision: null,
  name: 'Main channel',
  platform: 'youtube',
  url: 'https://www.youtube.com/@creator',
  label_ids: [],
  archived: false,
};

test('channel records never grant publishing capability and reject stale writes', () => {
  const catalog = new WorkspaceCatalog(':memory:', unusedExport);
  try {
    const saved = catalog.saveChannel(channel);
    assert.equal(saved.revision, 1);
    // The stored record carries no connection or capability; only the snapshot decorates it.
    assert.equal(saved.connection, undefined);
    assert.equal(saved.can_publish, undefined);
    assert.equal(catalog.listChannels()[0].connection, 'not_connected');
    assert.equal(catalog.listChannels()[0].can_publish, false);
    assert.throws(() => catalog.saveChannel({ ...channel, name: 'Stale' }), /REVISION_CONFLICT/);
    assert.equal(catalog.listChannels()[0].name, 'Main channel');
  } finally {
    catalog.close();
  }
});

test('shared labels retain their identity and reject duplicate normalized names', () => {
  const catalog = new WorkspaceCatalog(':memory:', unusedExport);
  try {
    const label = catalog.saveLabel({
      id: 'label_001',
      expected_revision: null,
      name: 'Máy ảnh',
      kind: 'tag',
      archived: false,
    });
    assert.throws(
      () =>
        catalog.saveLabel({
          id: 'label_002',
          expected_revision: null,
          name: 'MÁY ẢNH',
          kind: 'tag',
          archived: false,
        }),
      /LABEL_EXISTS/,
    );
    const saved = catalog.saveChannel({ ...channel, label_ids: [label.id] });
    catalog.saveLabel({
      id: label.id,
      expected_revision: 1,
      name: 'Camera',
      kind: 'tag',
      archived: false,
    });
    assert.deepEqual(saved.label_ids, ['label_001']);
    assert.equal(catalog.snapshot(false).labels[0].name, 'Camera');
  } finally {
    catalog.close();
  }
});
