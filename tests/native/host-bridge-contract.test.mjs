import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { events } from '../../dist-core/host-bridge/events.js';
import { operationGroups } from '../../dist-core/host-bridge/operation-groups.js';
import { operations } from '../../dist-core/host-bridge/operations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function electronSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...electronSourceFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.cts')) files.push(full);
  }
  return files;
}

const electronFiles = electronSourceFiles(path.join(root, 'app', 'electron'));

test('capability operation groups compose the canonical registry without collisions', () => {
  assert.deepEqual(Object.keys(operationGroups), [
    'library',
    'batch',
    'folders',
    'automation',
    'settings',
    'sources',
    'catalog',
    'distribution',
    'diagnostics',
    'profiles',
    'recovery',
    'speech',
    'synthesis',
    'translation',
    'vision',
    'editor',
    'audio',
    'composition',
    'workspace',
  ]);
  const groupedNames = Object.values(operationGroups).flatMap((group) => Object.keys(group));
  assert.equal(new Set(groupedNames).size, groupedNames.length, 'operation groups overlap');
  assert.deepEqual(groupedNames.sort(), Object.keys(operations).sort());
});

test('every canonical operation has exactly one host.wire() registration, and vice versa', () => {
  const registeredNames = new Set();
  const wireCall = /\bwire\(\s*'([a-z0-9-]+)'/g;
  for (const file of electronFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(wireCall)) registeredNames.add(match[1]);
  }
  const declaredNames = new Set(Object.keys(operations));
  const declaredButUnwired = [...declaredNames].filter((name) => !registeredNames.has(name));
  const wiredButUndeclared = [...registeredNames].filter((name) => !declaredNames.has(name));
  assert.deepEqual(declaredButUnwired, [], 'operation declared in the registry but never wired');
  assert.deepEqual(wiredButUndeclared, [], 'host.wire() call with no canonical registry entry');
});

test('every canonical event is actually sent by some host adapter', () => {
  const sentChannels = new Set();
  const directSend = /webContents\.send\(\s*'reupmatic:([a-z0-9-]+)'/g;
  // A feature-local `send(channel, ...)` helper that templates `reupmatic:${channel}` (speech,
  // synthesis, translation) forwards whatever channel name its own call sites pass; treat any
  // bare `send('name', ...)` call in such a file as sending that channel.
  const templatedHelper = /`reupmatic:\$\{channel\}`/;
  const helperCall = /\bsend\(\s*'([a-z0-9-]+)'/g;
  for (const file of electronFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(directSend)) sentChannels.add(match[1]);
    if (templatedHelper.test(source)) {
      for (const match of source.matchAll(helperCall)) sentChannels.add(match[1]);
    }
  }
  const declaredNames = new Set(Object.keys(events));
  const declaredButUnsent = [...declaredNames].filter((name) => !sentChannels.has(name));
  assert.deepEqual(declaredButUnsent, [], 'event declared in the registry but never sent');
});

// Captions › Create › SRT opens a caption-only picker, never the general media picker.
test('the caption picker takes no input and offers exactly the formats the worker parses', async () => {
  const entry = operations['import-captions'];
  assert.equal(entry.rendererMethod, 'importCaptions');
  assert.equal(entry.validate(undefined), undefined);
  for (const input of [null, {}, { kind: 'subtitle' }, 'srt', ['srt'], { path: '/tmp/a.srt' }]) {
    assert.throws(() => entry.validate(input), /INVALID_REQUEST/);
  }
  assert.equal(entry.toRequest(), undefined);
  const { LOCAL_MEDIA_EXTENSIONS } = await import('../../dist-core/library/content-source.js');
  const service = readFileSync(path.join(root, 'worker/subtitles/service.py'), 'utf8');
  const parsed = service.match(/if kind not in \(([^)]*)\):/);
  assert.ok(parsed, 'worker subtitle loader lists its formats');
  const formats = [...parsed[1].matchAll(/"([a-z0-9]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...LOCAL_MEDIA_EXTENSIONS.subtitle].sort(), formats.sort());
  const host = readFileSync(path.join(root, 'app/electron/features/editor/ipc.ts'), 'utf8');
  const wired = host.match(/wire\('import-captions'[\s\S]*?\n {2}\}\);/);
  assert.ok(wired, 'import-captions is wired in the editor host');
  assert.match(wired[0], /filters: subtitleFilters/);
  const srt = readFileSync(
    path.join(root, 'app/ui/features/editor/captions/SrtCreate.tsx'),
    'utf8',
  );
  assert.match(srt, /editor\.importCaptions\(\)/);
  assert.doesNotMatch(srt, /importMedia/);
});
