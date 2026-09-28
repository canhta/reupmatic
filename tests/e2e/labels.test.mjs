import assert from 'node:assert/strict';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

test('Shared labels stay manageable from the Library toolbar dialog (UI-CM05)', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-labels-table-');
  await runElectronTest(
    { temp, userData, screenshotName: 'labels-table-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();

      assert.equal(await page.getByRole('tab', { name: 'Shared labels', exact: true }).count(), 0);

      await page.getByRole('button', { name: 'More actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Manage shared labels…', exact: true }).click();
      const manager = page.getByRole('dialog', { name: 'Shared labels', exact: true });
      await manager.waitFor();

      await manager.getByText('No shared labels yet', { exact: true }).waitFor();

      await page.evaluate(async () => {
        const kinds = ['tag', 'category', 'group'];
        for (let i = 1; i <= 30; i++) {
          const n = String(i).padStart(2, '0');
          await window.reupmatic.catalogSaveLabel({
            id: crypto.randomUUID(),
            expected_revision: null,
            name: `Zebra ${n}`,
            kind: kinds[i % kinds.length],
            archived: false,
          });
        }
      });
      await manager.getByText('1–25 of 30', { exact: true }).waitFor();

      const firstRow = manager.locator('table tbody tr').first();
      await firstRow.getByText('Zebra 01', { exact: true }).waitFor();

      await manager
        .getByRole('columnheader', { name: 'Name', exact: false })
        .getByRole('button')
        .first()
        .click();
      await firstRow.getByText('Zebra 30', { exact: true }).waitFor();

      await manager.getByRole('button', { name: 'Go to next page', exact: true }).click();
      await firstRow.getByText('Zebra 05', { exact: true }).waitFor();

      await manager.getByRole('textbox', { name: 'Search', exact: true }).fill('Zebra 02');
      await firstRow.getByText('Zebra 02', { exact: true }).waitFor();
      assert.equal(await manager.locator('table tbody tr').count(), 1);
      assert.equal(await manager.getByRole('button', { name: 'Go to next page' }).count(), 0);
      await manager.getByRole('textbox', { name: 'Search', exact: true }).fill('');

      await manager.getByRole('textbox', { name: 'Search', exact: true }).fill('Nonexistent');
      await manager.getByText('No matching labels', { exact: true }).waitFor();
      await manager.getByRole('button', { name: 'Clear search', exact: true }).click();
      await firstRow.waitFor();
    },
  );
});
