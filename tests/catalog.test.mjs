import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogDatabase } from '../dist-core/catalog/catalog-database.js';
import { TaxonomyStore } from '../dist-core/taxonomy/taxonomy-store.js';
import { DistributionStore } from '../dist-core/distribution/distribution-store.js';

const channel = { id: 'channel_001', expected_revision: null, name: 'Main channel', platform: 'youtube',
  url: 'https://www.youtube.com/@creator', label_ids: [], archived: false };

test('channel records never grant publishing capability and reject stale writes', () => {
  const db = new CatalogDatabase(':memory:');
  try {
    const store = new DistributionStore(db, new TaxonomyStore(db));
    const saved = store.saveChannel(channel);
    assert.equal(saved.revision, 1);
    assert.equal(saved.connection, 'not_connected');
    assert.equal(saved.can_publish, false);
    assert.throws(() => store.saveChannel({ ...channel, name: 'Stale' }), /REVISION_CONFLICT/);
    assert.equal(store.channels()[0].name, 'Main channel');
  } finally { db.close(); }
});

test('shared labels retain their identity and reject duplicate normalized names', () => {
  const db = new CatalogDatabase(':memory:');
  try {
    const taxonomy = new TaxonomyStore(db);
    const label = taxonomy.save({ id: 'label_001', expected_revision: null, name: 'Máy ảnh', kind: 'tag', archived: false });
    assert.throws(() => taxonomy.save({ id: 'label_002', expected_revision: null, name: 'MÁY ẢNH', kind: 'tag', archived: false }), /LABEL_EXISTS/);
    const channels = new DistributionStore(db, taxonomy);
    const saved = channels.saveChannel({ ...channel, label_ids: [label.id] });
    taxonomy.save({ id: label.id, expected_revision: 1, name: 'Camera', kind: 'tag', archived: false });
    assert.deepEqual(saved.label_ids, ['label_001']);
    assert.equal(taxonomy.list()[0].name, 'Camera');
  } finally { db.close(); }
});
