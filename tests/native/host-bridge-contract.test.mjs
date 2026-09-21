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
