import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Fast Refresh makes any module that declares a component accept its own hot updates, so a
// component in the entry re-runs createRoot on the mounted container instead of reloading.
test('the renderer entry is never a hot-update boundary', async () => {
  const server = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const result = await server.transformRequest('/main.tsx');
    assert.ok(result, 'the entry transforms');
    assert.doesNotMatch(result.code, /import\.meta\.hot\.accept/);
  } finally {
    await server.close();
  }
});
