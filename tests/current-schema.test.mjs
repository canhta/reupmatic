import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { BatchStore } from '../dist-core/batch/batch-store.js';
import { CatalogDatabase } from '../dist-core/catalog/catalog-database.js';
import { FolderStore } from '../dist-core/folders/folder-store.js';
import { LibraryStore } from '../dist-core/library/library-store.js';

const stores = [
  [BatchStore, 'QUEUE_VERSION', 1], [CatalogDatabase, 'CATALOG_VERSION', 1],
  [FolderStore, 'WATCH_VERSION', 1], [LibraryStore, 'LIBRARY_VERSION', 2],
];

async function location(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-schema-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'data.sqlite');
}

for (const [Store, code, version] of stores) {
  test(`${Store.name}: initialize a fresh store and reopen only its current schema`, async t => {
    const file = await location(t);
    new Store(file).close();
    const inspect = new DatabaseSync(file);
    assert.equal(inspect.prepare('PRAGMA user_version').get().user_version, version);
    inspect.close();
    assert.doesNotThrow(() => new Store(file).close());
  });

  test(`${Store.name}: refuse unversioned, unknown and incomplete stores without rewriting them`, async t => {
    for (const version of [0, 1, 2, -1]) {
      const file = await location(t);
      const seed = new DatabaseSync(file);
      seed.exec(`CREATE TABLE owner_data (value TEXT); INSERT INTO owner_data VALUES ('keep'); PRAGMA user_version=${version}`);
      seed.close();
      const before = await readFile(file);
      assert.throws(() => new Store(file).close(), new RegExp(code));
      assert.deepEqual(await readFile(file), before);
      const inspect = new DatabaseSync(file);
      assert.equal(inspect.prepare('SELECT value FROM owner_data').get().value, 'keep');
      assert.equal(inspect.prepare('PRAGMA user_version').get().user_version, version);
      inspect.close();
    }
  });
}
