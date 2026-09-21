import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { electronCookieJar } from '../../dist-node/electron/features/sources/cookie-jar.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

test('exactly one module owns the persist:douyin partition string literal, and it is the sources feature', () => {
  // Matches only an actual quoted string literal (real code), not the many doc-comment mentions
  // of the partition name in backticks elsewhere in this feature.
  const literal = /['"]persist:douyin['"]/;
  const owners = [];
  for (const file of sourceFiles(path.join(root, 'app'))) {
    const source = readFileSync(file, 'utf8');
    if (literal.test(source)) owners.push(path.relative(root, file));
  }
  assert.deepEqual(owners, [path.join('app', 'electron', 'features', 'sources', 'ipc.ts')]);
});

// A fake Electron `Session`-shaped cookie source. Deliberately gives every cookie a realistic,
// identifiable value — if any of that value ever escaped this adapter (into a log, a thrown
// message, or a returned field), the assertions below that scan for the literal string would
// catch it.
const SECRET = 'sekrit-9f3c1e7b-should-never-leave-the-adapter';
function fakeSession(present) {
  return {
    cookies: {
      async get({ name }) {
        return present.includes(name) ? [{ value: `${SECRET}-${name}` }] : [];
      },
    },
    async clearStorageData() {
      this.cleared = true;
    },
  };
}

test('identityCookies() reports only cookie names, never a value', async () => {
  const jar = electronCookieJar(fakeSession(['sessionid', 'sid_guard']));
  const present = await jar.identityCookies();
  assert.deepEqual([...present].sort(), ['sessionid', 'sid_guard']);
  for (const name of present) assert.ok(!name.includes(SECRET));
});

test('a cookie with an empty value does not count as present', async () => {
  const session = {
    cookies: {
      async get() {
        return [{ value: '' }];
      },
    },
    async clearStorageData() {},
  };
  const jar = electronCookieJar(session);
  assert.deepEqual([...(await jar.identityCookies())], []);
});

test('clear() wipes the whole partition (clearStorageData), not a partial cookie removal', async () => {
  const session = fakeSession(['sessionid', 'sid_guard', 'sid_tt']);
  const jar = electronCookieJar(session);
  await jar.clear();
  assert.equal(session.cleared, true);
});

test('importCookies() writes a durable expiry, so a pasted session survives a restart', async () => {
  const writes = [];
  const session = {
    cookies: {
      async set(details) {
        writes.push(details);
      },
    },
    async clearStorageData() {},
  };
  const jar = electronCookieJar(session);
  await jar.importCookies([{ name: 'sid_guard', value: 'pasted-value' }]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'sid_guard');
  assert.equal(writes[0].domain, '.douyin.com');
  assert.ok(
    writes[0].expirationDate > Date.now() / 1000 + 60,
    'a pasted cookie must not be written as a session cookie',
  );
});

test('no cookie/session value is ever written to the console while reading or clearing the jar', async () => {
  const seen = [];
  const originals = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };
  for (const key of Object.keys(originals)) {
    console[key] = (...args) => seen.push(args.map(String).join(' '));
  }
  try {
    const session = fakeSession(['sessionid', 'sid_guard', 'sid_tt']);
    const jar = electronCookieJar(session);
    await jar.identityCookies();
    await jar.clear();
  } finally {
    Object.assign(console, originals);
  }
  const output = seen.join('\n');
  assert.equal(output.includes(SECRET), false, `console output leaked a session value: ${output}`);
});
