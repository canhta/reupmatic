// Real Electron/Playwright dependencies. Only the native folder pickers are
// controlled fixture input; renderer, IPC and folder-watch storage are real.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { pythonExecutable } from '../../scripts/python.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function createRule(page, application, source, output) {
  await application.evaluate(
    ({ dialog }, choices) => {
      const pending = [[choices.source], [choices.output]];
      dialog.showOpenDialog = async () => {
        const files = pending.shift();
        if (!files) throw new Error('Unexpected picker');
        return { canceled: false, filePaths: files };
      };
    },
    { source, output },
  );
  await page.getByRole('button', { name: 'Choose source folder', exact: true }).click();
  await page.getByRole('button', { name: 'Choose destination folder', exact: true }).click();
  await page
    .getByRole('radio', { name: 'New or changed files after the first inventory', exact: true })
    .check();
  await page.getByRole('button', { name: 'Save rule', exact: true }).click();
  await page.getByText('Rule saved. Start monitoring when ready.', { exact: true }).waitFor();
}

test('Folder rules table search and sort apply to the whole list (UI-CM05)', {
  timeout: 90000,
}, async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'reupmatic-folder-table-')),
  );
  const userData = path.join(dir, 'app-data');
  await fs.mkdir(userData);
  // Names chosen so alphabetic sort differs from creation order.
  const rules = [
    { source: path.join(dir, 'zebra-in'), output: path.join(dir, 'zebra-out') },
    { source: path.join(dir, 'alpha-in'), output: path.join(dir, 'alpha-out') },
  ];
  for (const rule of rules) {
    await fs.mkdir(rule.source, { recursive: true });
    await fs.mkdir(rule.output, { recursive: true });
  }
  let application;
  try {
    application = await electron.launch({
      cwd: root,
      args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'tests/e2e/launch.mjs'],
      env: {
        ...process.env,
        REUPMATIC_TEST_USER_DATA: userData,
        REUPMATIC_DEV_AUTOMATION: '1',
        PYTHON: pythonExecutable(root),
      },
    });
    const page = await application.firstWindow();
    await waitForEditorReady(page);
    await page.getByRole('button', { name: 'Automation', exact: true }).click();
    await page.getByRole('tab', { name: 'Folder intake', exact: true }).click();

    for (const rule of rules) {
      await createRule(page, application, rule.source, rule.output);
    }
    const scope = page.locator('.folder-rules');
    await scope.locator('.count-label', { hasText: '2' }).waitFor();

    const table = scope.locator('table tbody tr');
    await table.first().waitFor();
    assert.equal(await table.count(), 2);

    // Sort ascending by the route (source folder name): the whole list
    // reorders, not just the visible slice.
    await scope
      .getByRole('columnheader', { name: 'Source → Destination', exact: false })
      .getByRole('button')
      .first()
      .click();
    await table.first().getByText('alpha-in', { exact: false }).waitFor();

    // Search narrows the whole list.
    await scope.getByRole('textbox', { name: 'Search', exact: true }).fill('zebra');
    await table.first().getByText('zebra-in', { exact: false }).waitFor();
    assert.equal(await table.count(), 1);

    // No match: a no-results state distinct from the empty state.
    await scope.getByRole('textbox', { name: 'Search', exact: true }).fill('nonexistent');
    await page.getByText('No matching folder rules', { exact: true }).waitFor();
    await scope.getByRole('button', { name: 'Clear search', exact: true }).click();
    await table.first().waitFor();
  } finally {
    if (application) await application.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
