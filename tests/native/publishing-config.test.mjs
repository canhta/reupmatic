import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readEnvPublishingConfig } from '../../dist-node/electron/features/publishing/config.js';
import {
  publishingConfigFromEnv,
  renderPublishingConfigModule,
} from '../../scripts/generate-publishing-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts', 'generate-publishing-config.mjs');

test('build config needs both values and an https broker URL', () => {
  assert.equal(publishingConfigFromEnv({}), null);
  assert.equal(publishingConfigFromEnv({ REUPMATIC_META_APP_ID: '1' }), null);
  assert.equal(
    publishingConfigFromEnv({
      REUPMATIC_META_APP_ID: '1',
      REUPMATIC_META_BROKER_URL: 'http://x/y',
    }),
    null,
  );
  assert.deepEqual(
    publishingConfigFromEnv({
      REUPMATIC_META_APP_ID: '1',
      REUPMATIC_META_BROKER_URL: 'https://x.example/api/facebook/token/',
    }),
    { metaAppId: '1', brokerUrl: 'https://x.example/api/facebook/token' },
  );
  assert.deepEqual(readEnvPublishingConfig({}), null);
});

test('the generator bakes the build environment into a generated module', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reupmatic-publishing-config-'));
  const target = path.join(directory, 'config.generated.ts');
  try {
    execFileSync(process.execPath, [script, '--out', target], {
      env: {
        ...process.env,
        REUPMATIC_META_APP_ID: '424242',
        REUPMATIC_META_BROKER_URL: 'https://broker.example/api/facebook/token',
      },
    });
    const generated = readFileSync(target, 'utf-8');
    assert.match(generated, /GENERATED_PUBLISHING_CONFIG: PublishingConfig \| null = \{/);
    assert.ok(generated.includes('424242'));
    assert.ok(generated.includes('https://broker.example/api/facebook/token'));
    assert.ok(!generated.includes('process.env'));

    const empty = renderPublishingConfigModule(null);
    assert.match(empty, /GENERATED_PUBLISHING_CONFIG: PublishingConfig \| null = null/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
