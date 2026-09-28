import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DouyinChannelStore } from '../../dist-core/sources/douyin-channel-store.js';

async function location(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-channels-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'channels.sqlite');
}

test('saved channels list most recently scanned first and upsert on sec_uid', async (t) => {
  const file = await location(t);
  const store = new DouyinChannelStore(file);
  store.save({ secUid: 'A', nickname: 'Alpha' }, 1000);
  store.save({ secUid: 'B', nickname: 'Beta' }, 2000);
  assert.deepEqual(
    store.list().map((channel) => channel.secUid),
    ['B', 'A'],
  );
  store.save({ secUid: 'A', nickname: 'Alpha renamed' }, 3000);
  assert.deepEqual(
    store.list().map((channel) => [channel.secUid, channel.nickname]),
    [
      ['A', 'Alpha renamed'],
      ['B', 'Beta'],
    ],
  );
  assert.equal(store.list().length, 2, 'upsert never duplicates a channel');
  store.close();
});

test('a saved channel survives closing and reopening the store', async (t) => {
  const file = await location(t);
  const first = new DouyinChannelStore(file);
  first.save({ secUid: 'A', nickname: 'Alpha' }, 1000);
  first.close();
  const second = new DouyinChannelStore(file);
  assert.deepEqual(second.list(), [{ secUid: 'A', nickname: 'Alpha', lastScannedAt: 1000 }]);
  second.close();
});
