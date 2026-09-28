import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { BatchStore } from '../../dist-core/batch/batch-store.js';
import { CatalogDatabase } from '../../dist-core/catalog/catalog-database.js';
import { FolderStore } from '../../dist-core/folders/folder-store.js';
import { ContentLibrary } from '../../dist-core/library/content-library.js';
import { DouyinChannelStore } from '../../dist-core/sources/douyin-channel-store.js';
import { DouyinSessionStore } from '../../dist-core/sources/douyin-session-store.js';

const stores = [
  { name: BatchStore.name, open: (file) => new BatchStore(file), code: 'QUEUE_VERSION' },
  {
    name: CatalogDatabase.name,
    open: (file) => new CatalogDatabase(file),
    code: 'CATALOG_VERSION',
  },
  { name: FolderStore.name, open: (file) => new FolderStore(file), code: 'WATCH_VERSION' },
  {
    name: ContentLibrary.name,
    open: (file) =>
      new ContentLibrary(file, path.join(path.dirname(file), 'managed'), {
        inspectOriginal: async () => {
          throw new Error('UNUSED_INSPECTOR');
        },
      }),
    code: 'LIBRARY_VERSION',
  },
  {
    name: DouyinSessionStore.name,
    open: (file) => new DouyinSessionStore(file),
    code: 'DOUYIN_SESSION_VERSION',
  },
  {
    name: DouyinChannelStore.name,
    open: (file) => new DouyinChannelStore(file),
    code: 'DOUYIN_CHANNEL_VERSION',
  },
];

async function location(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-schema-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'data.sqlite');
}

for (const { name, open, code } of stores) {
  test(`${name}: initialize a fresh store and reopen only its current schema`, async (t) => {
    const file = await location(t);
    open(file).close();
    assert.doesNotThrow(() => open(file).close());
  });

  test(`${name}: refuse a foreign table set without rewriting it`, async (t) => {
    const file = await location(t);
    const seed = new DatabaseSync(file);
    seed.exec("CREATE TABLE owner_data (value TEXT); INSERT INTO owner_data VALUES ('keep');");
    seed.close();
    const before = await readFile(file);
    assert.throws(() => open(file).close(), new RegExp(code));
    assert.deepEqual(await readFile(file), before);
    const inspect = new DatabaseSync(file);
    assert.equal(inspect.prepare('SELECT value FROM owner_data').get().value, 'keep');
    inspect.close();
  });
}
