import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8');

// The staged FFmpeg is arm64-only on macOS; an x64 mac target would package the wrong binary.
test('every macOS target builds arm64 only', () => {
  const mac = config.split('\nmac:\n')[1]?.split(/\n[a-z]/)[0];
  assert.ok(mac, 'mac: section not found in electron-builder.yml');
  const targets = mac.split('\n  target:\n')[1]?.split(/\n {2}[a-zA-Z]/)[0] ?? '';
  const entries = `\n${targets}`.split(/\n {4}- /).slice(1);
  assert.deepEqual(
    entries.map((entry) => entry.match(/^target: (\w+)/)?.[1]),
    ['dmg', 'zip'],
  );
  for (const entry of entries) {
    assert.match(entry, /\n {6}arch: arm64(\n|$)/, `${entry.split('\n')[0]} must pin arch arm64`);
  }
});
