import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DouyinSession } from '../../dist-core/sources/douyin-session.js';
import { DouyinSessionStore } from '../../dist-core/sources/douyin-session-store.js';

function fakeCookies(namesPresent) {
  const imported = [];
  return {
    imported,
    importCookies: async (cookies) => {
      for (const cookie of cookies) {
        imported.push(cookie.name);
        namesPresent.push(cookie.name);
      }
    },
    identityCookies: async () => new Set(namesPresent),
    clear: async () => {
      cleared.count += 1;
    },
  };
}
const cleared = { count: 0 };

async function tmpFile(t) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'reupmatic-douyin-')));
  const file = path.join(dir, 'douyin-session.sqlite');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return file;
}

test('never connected: refresh() reports not_connected without touching the store', async (t) => {
  const store = new DouyinSessionStore(await tmpFile(t));
  t.after(() => store.close());
  const session = new DouyinSession({ cookies: fakeCookies([]), store, now: () => 111 });
  const snapshot = await session.refresh();
  assert.deepEqual(snapshot, { status: 'not_connected', connectedAt: null, checkedAt: 111 });
});

test('all identity cookies present: refresh() reports connected and persists it', async (t) => {
  const store = new DouyinSessionStore(await tmpFile(t));
  t.after(() => store.close());
  const session = new DouyinSession({
    cookies: fakeCookies(['sid_guard', 'sessionid', 'sid_tt']),
    store,
    now: () => 222,
  });
  const snapshot = await session.refresh();
  assert.equal(snapshot.status, 'connected');
  assert.equal(snapshot.connectedAt, 222);
  assert.deepEqual(store.read(), { everConnected: true, connectedAt: 222 });
});

test('a partial identity cookie set does not count as connected', async (t) => {
  const store = new DouyinSessionStore(await tmpFile(t));
  t.after(() => store.close());
  const session = new DouyinSession({
    cookies: fakeCookies(['sessionid']), // missing sid_guard/sid_tt
    store,
    now: () => 333,
  });
  const snapshot = await session.refresh();
  assert.equal(snapshot.status, 'not_connected');
});

test('a session that was connected and then loses its cookies needs reconnect, not not_connected', async (t) => {
  const store = new DouyinSessionStore(await tmpFile(t));
  t.after(() => store.close());
  const connect = new DouyinSession({
    cookies: fakeCookies(['sid_guard', 'sessionid', 'sid_tt']),
    store,
    now: () => 10,
  });
  await connect.refresh();
  const expired = new DouyinSession({ cookies: fakeCookies([]), store, now: () => 20 });
  const snapshot = await expired.refresh();
  assert.equal(snapshot.status, 'needs_reconnect');
  // The last confirmed connection time is preserved, not clobbered by a failed check.
  assert.equal(snapshot.connectedAt, 10);
});

test('disconnect clears the cookie jar entirely and returns to not_connected', async (t) => {
  const store = new DouyinSessionStore(await tmpFile(t));
  t.after(() => store.close());
  cleared.count = 0;
  const session = new DouyinSession({
    cookies: fakeCookies(['sid_guard', 'sessionid', 'sid_tt']),
    store,
    now: () => 1,
  });
  await session.refresh();
  const snapshot = await session.disconnect();
  assert.equal(cleared.count, 1);
  assert.deepEqual(snapshot, { status: 'not_connected', connectedAt: null, checkedAt: 1 });
  assert.deepEqual(store.read(), { everConnected: false, connectedAt: null });
});

test('disconnect after needs_reconnect also returns to not_connected, not needs_reconnect', async (t) => {
  const store = new DouyinSessionStore(await tmpFile(t));
  t.after(() => store.close());
  const connect = new DouyinSession({
    cookies: fakeCookies(['sid_guard', 'sessionid', 'sid_tt']),
    store,
    now: () => 1,
  });
  await connect.refresh();
  const expired = new DouyinSession({ cookies: fakeCookies([]), store, now: () => 2 });
  await expired.disconnect();
  assert.deepEqual(store.read(), { everConnected: false, connectedAt: null });
});

test('the persisted "ever connected" intent survives closing and reopening the store — the restart case', async (t) => {
  const file = await tmpFile(t);
  const before = new DouyinSessionStore(file);
  before.markConnected(999);
  before.close();

  // A fresh instance over the same file simulates the app restarting: nothing in memory carries
  // over, only the file on disk.
  const after = new DouyinSessionStore(file);
  t.after(() => after.close());
  assert.deepEqual(after.read(), { everConnected: true, connectedAt: 999 });

  // And a session built on that reopened store reports needs_reconnect (not not_connected) when
  // the cookie jar it is paired with (a fresh Electron partition read, in the real app) currently
  // has none of the identity cookies — exactly the "expired while the app was closed" case.
  const session = new DouyinSession({ cookies: fakeCookies([]), store: after, now: () => 1000 });
  assert.equal((await session.refresh()).status, 'needs_reconnect');
});

test('importing cookies writes them to the same jar and derives status by the same refresh', async (t) => {
  const cookies = fakeCookies([]);
  const store = new DouyinSessionStore(await tmpFile(t));
  const session = new DouyinSession({ cookies, store });

  assert.equal((await session.refresh()).status, 'not_connected');

  const snapshot = await session.importCookies(
    'sessionid=abc; sid_guard=def; sid_tt=ghi; ttwid=anon',
  );
  // The advanced path is not a second implementation: it writes the same jar Connect writes and
  // then reports status through the same refresh, so an imported session cannot behave
  // differently from one logged in through the browser window.
  assert.equal(snapshot.status, 'connected');
  assert.deepEqual(cookies.imported.sort(), ['sessionid', 'sid_guard', 'sid_tt', 'ttwid']);
});

test('a paste that carries no signed-in identity is refused before anything is written', async (t) => {
  const cookies = fakeCookies([]);
  const session = new DouyinSession({ cookies, store: new DouyinSessionStore(await tmpFile(t)) });

  await assert.rejects(session.importCookies('ttwid=anon; odin_tt=zzz'), /MISSING_IDENTITY/);
  assert.deepEqual(cookies.imported, [], 'cookies were written despite the refusal');
});

test('a refusal never carries the pasted value into its error', async (t) => {
  const session = new DouyinSession({
    cookies: fakeCookies([]),
    store: new DouyinSessionStore(await tmpFile(t)),
  });
  await assert.rejects(session.importCookies('ttwid=SUPERSECRET'), (error) => {
    assert.ok(!error.message.includes('SUPERSECRET'), 'error leaked the paste');
    return true;
  });
});
