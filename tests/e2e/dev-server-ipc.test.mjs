// Reproduces `pnpm dev`: a real Vite dev server plus a real Electron window pointed at it via
// REUPMATIC_DEV_SERVER_URL (see scripts/dev.mjs), unlike every other e2e spec which only
// exercises the packaged app:// origin. Regression coverage for the ipc.ts sender-frame guard,
// which only ever allow-listed app://ui/ and rejects every operation from the dev server origin.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Electron via the pnpm dev server URL can complete an IPC operation', {
  timeout: 30_000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-dev-server-');
  const viteServer = await createServer({ configFile: path.join(root, 'vite.config.ts') });
  await viteServer.listen();
  const devServerUrl = viteServer.resolvedUrls?.local?.[0];
  assert.ok(devServerUrl, 'Vite dev server did not report a local URL');
  try {
    await runElectronTest(
      { temp, userData, env: { REUPMATIC_DEV_SERVER_URL: devServerUrl } },
      async ({ page }) => {
        await waitForEditorReady(page);
        await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
        // The catalog loaded successfully: no FORBIDDEN banner, and the real Library UI rendered.
        assert.equal(await page.getByText('FORBIDDEN', { exact: true }).count(), 0);
        await page
          .getByRole('button', { name: 'Import local files', exact: true })
          .waitFor({ timeout: 5_000 });
      },
    );
  } finally {
    await viteServer.close();
  }
});
