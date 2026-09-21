// Real Electron/Playwright dependencies. Native pickers are controlled
// fixture input. Renderer, IPC and FFmpeg are real; no mocked catalog,
// workflow save or media is substituted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { chooseLocale, waitForEditorReady } from './ui-actions.mjs';

async function makeClip(video) {
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=30:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-n',
    video,
  ]);
}

async function importLibraryItem(page, application, video, output) {
  await waitForEditorReady(page);
  const pending = [[video], [output]];
  await application.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => {
      const chosen = files.shift();
      if (!chosen) throw new Error('Unexpected native picker request in test');
      return { canceled: false, filePaths: chosen };
    };
    // runElectronTest's own harness stubs the quit-confirmation dialog by
    // default (electron-harness.mjs), so a queued/admitted job at shutdown
    // no longer needs its own copy here.
  }, pending);
  await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
  await page.getByRole('button', { name: 'Import local files', exact: true }).click();
  await page.getByText('1 imported, 0 reused, 0 failed.', { exact: true }).waitFor();
}

test('Automation opens on the saved-workflow list; the editor is a focused canvas opened only on intent', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-automation-');
  const video = path.join(temp, 'automation-clip.mp4');
  const output = path.join(temp, 'export');
  await mkdir(output);
  await makeClip(video);
  await runElectronTest(
    { temp, userData, screenshotName: 'automation-failure.png' },
    async ({ application, page }) => {
      await importLibraryItem(page, application, video, output);

      await page.getByRole('button', { name: 'Automation', exact: true }).click();

      // Empty state: no workflows yet, and no permanent scope banner/paragraph.
      await page.getByText('No saved local workflows', { exact: true }).waitFor();
      assert.equal(
        await page.getByText('Saved Library-to-export workflows', { exact: false }).count(),
        0,
        'the permanent scope banner must be gone',
      );
      // Both the toolbar's persistent action and the empty state's own action
      // exist; the ticket requires the empty state to carry one action, not
      // that it be the page's only entry point.
      const createButtons = page.getByRole('button', {
        name: 'New workflow…',
        exact: true,
      });
      assert.equal(await createButtons.count(), 2);
      await createButtons.first().click();

      // The editor is a focused canvas: a horizontal stepper header, not a
      // permanently-docked column. All five stages stay reachable.
      const identityStep = page.getByRole('button', {
        name: 'Go to step 1: Identity',
        exact: true,
      });
      await identityStep.waitFor();
      assert.equal(await page.getByRole('button', { name: 'Back to workflows' }).count(), 1);
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Nightly export');

      await page.getByRole('button', { name: 'Go to step 2: Library inputs', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Select automation-clip.mp4', exact: true }).check();
      await page.getByText('1 input selected', { exact: true }).waitFor();
      // One library item fits on a single page: no pagination controls (UI-CP04).
      assert.equal(
        await page.getByRole('button', { name: 'Go to previous page' }).count(),
        0,
        'a single page of library inputs shows no pagination controls',
      );

      await page.getByRole('button', { name: 'Go to step 4: Outputs', exact: true }).click();
      await page.getByRole('button', { name: 'Choose output folder', exact: true }).click();
      await page.getByText(output, { exact: false }).waitFor();

      await page.getByRole('button', { name: 'Go to step 5: Review', exact: true }).click();
      const saveButton = page.getByRole('button', { name: 'Save changes', exact: true });
      await saveButton.waitFor();
      assert.equal(await saveButton.isDisabled(), false);
      await saveButton.click();
      await page.getByText('Workflow saved.', { exact: true }).waitFor();

      // Back returns to the list and focus lands back on the control that
      // opened the editor (here, the toolbar's own Create action).
      await page.getByRole('button', { name: 'Back to workflows' }).click();
      await page.getByRole('cell', { name: 'Nightly export', exact: false }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'New workflow…');

      // Execution capability is stated beside the Queue action, not as a
      // page-level banner or paragraph.
      const queueButton = page.getByRole('button', { name: 'Queue', exact: true });
      await queueButton.waitFor();
      assert.equal(await queueButton.isDisabled(), true);
      await page.getByText('Run unavailable', { exact: true }).first().waitFor();

      // Dirty-discard: reopening the row, editing it, and backing out without
      // saving asks for confirmation and preserves the draft until confirmed.
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await identityStep.waitFor();
      await page
        .getByRole('textbox', { name: 'Name', exact: true })
        .fill('Nightly export (edited)');
      await page.keyboard.press('Escape');
      const confirmDialog = page.getByRole('alertdialog', { name: 'Confirm change', exact: true });
      await confirmDialog.waitFor();
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      // Cancelling the confirmation keeps the editor open with the edit intact.
      await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('textbox', { name: 'Name', exact: true }).inputValue(),
        'Nightly export (edited)',
      );
      await page.keyboard.press('Escape');
      await confirmDialog.waitFor();
      await confirmDialog.getByRole('button', { name: 'Continue', exact: true }).click();

      // Back in the list, unchanged, and focus returned to the row's Edit button.
      await page.getByRole('cell', { name: 'Nightly export', exact: false }).waitFor();
      assert.equal(await page.getByText('Nightly export (edited)').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Edit');
    },
  );
});

test('Run history is a dense expandable list; queue capability and copy follow locale', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-automation-runs-');
  const video = path.join(temp, 'automation-run-clip.mp4');
  const output = path.join(temp, 'export');
  await mkdir(output);
  await makeClip(video);
  await runElectronTest(
    {
      temp,
      userData,
      env: { REUPMATIC_DEV_AUTOMATION: '1' },
      screenshotName: 'automation-runs-failure.png',
    },
    async ({ application, page }) => {
      const T = 8000;
      await importLibraryItem(page, application, video, output);
      await page.getByRole('button', { name: 'Automation', exact: true }).click();
      await page.getByRole('button', { name: 'New workflow…', exact: true }).first().click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Queued export');
      await page
        .getByRole('button', { name: 'Go to step 2: Library inputs', exact: true })
        .click({ timeout: T });
      await page
        .getByRole('checkbox', { name: 'Select automation-run-clip.mp4', exact: true })
        .check({ timeout: T });
      await page
        .getByRole('button', { name: 'Go to step 4: Outputs', exact: true })
        .click({ timeout: T });
      await page
        .getByRole('button', { name: 'Choose output folder', exact: true })
        .click({ timeout: T });
      await page.getByText(output, { exact: false }).waitFor({ timeout: T });
      await page
        .getByRole('button', { name: 'Go to step 5: Review', exact: true })
        .click({ timeout: T });
      const saveButton = page.getByRole('button', { name: 'Save changes', exact: true });
      await saveButton.waitFor({ timeout: T });
      assert.equal(await saveButton.isDisabled(), false);
      await saveButton.click({ timeout: T });
      await page.getByText('Workflow saved.', { exact: true }).waitFor({ timeout: T });
      await page
        .getByRole('button', { name: 'Back to workflows', exact: true })
        .click({ timeout: T });

      // Local execution is enabled in this dev build: no "Run unavailable"
      // state beside the action, and the Queue button is enabled.
      assert.equal(await page.getByText('Run unavailable', { exact: true }).count(), 0);
      const queueButton = page.getByRole('button', { name: 'Queue', exact: true });
      await queueButton.waitFor({ timeout: T });
      assert.equal(await queueButton.isDisabled(), false);
      await queueButton.click({ timeout: T });
      await page
        .getByRole('alertdialog', { name: 'Confirm change', exact: true })
        .getByRole('button', { name: 'Continue', exact: true })
        .click({ timeout: T });

      // Queueing switches to Run history with the new run already expanded
      // (dense expandable list, not a separate list+detail pane). Scoped to
      // the runs panel: the workflows panel stays mounted (just hidden) and
      // repeats the same workflow name in its own row.
      const runsPanel = page.locator('#runs-panel');
      await runsPanel.waitFor({ state: 'visible', timeout: T });
      const runRow = runsPanel.getByText('Queued export', { exact: false });
      await runRow.waitFor({ timeout: T });
      const jobDetail = runsPanel.getByRole('button', { name: 'Open shared queue', exact: true });
      await jobDetail.waitFor({ timeout: T });

      // Collapsing the row hides job detail; expanding it again shows it.
      await runRow.click({ timeout: T });
      assert.equal(await jobDetail.count(), 0);
      await runRow.click({ timeout: T });
      await jobDetail.waitFor({ timeout: T });

      // Vietnamese copy: changing locale (via the Settings sidebar destination, D-57 — a real
      // area switch away from Automation and back now, not a same-page combobox) does not
      // reset the same run's expanded state; the surrounding labels translate, not the
      // user-authored name.
      await chooseLocale(application, page, 'vi');
      await page.getByRole('button', { name: 'Tự động hóa', exact: true }).click();
      await runRow.waitFor({ timeout: T });
      await runsPanel
        .getByRole('button', { name: 'Mở hàng đợi dùng chung', exact: true })
        .waitFor({ timeout: T });
      assert.equal(await page.getByText('Chưa thể chạy', { exact: true }).count(), 0);
    },
  );
});

async function createWorkflow(page, application, name, output) {
  await application.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, output);
  await page.getByRole('button', { name: 'New workflow…', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Go to step 2: Library inputs', exact: true }).click();
  await page
    .getByRole('checkbox', { name: /^Select /, exact: false })
    .first()
    .check();
  await page.getByRole('button', { name: 'Go to step 4: Outputs', exact: true }).click();
  await page.getByRole('button', { name: 'Choose output folder', exact: true }).click();
  await page.getByText(output, { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Go to step 5: Review', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByText('Workflow saved.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back to workflows', exact: true }).click();
}

test('Workflow table search and sort apply to the whole list (UI-CM05)', {
  timeout: 120000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-workflows-table-');
  const video = path.join(temp, 'workflows-table-clip.mp4');
  const output = path.join(temp, 'export');
  await mkdir(output);
  await makeClip(video);
  await runElectronTest(
    { temp, userData, screenshotName: 'workflows-table-failure.png' },
    async ({ application, page }) => {
      await importLibraryItem(page, application, video, output);
      await page.getByRole('button', { name: 'Automation', exact: true }).click();

      await createWorkflow(page, application, 'Zebra export', output);
      await createWorkflow(page, application, 'Alpha export', output);
      await page.getByText('2 workflows', { exact: true }).waitFor({ timeout: 90000 });

      // Default sort is ascending by name.
      const firstRow = page.locator('#workflows-panel table tbody tr').first();
      await firstRow.getByText('Alpha export', { exact: true }).waitFor({ timeout: 90000 });

      // Sort descending: the whole list reorders, not just a visible slice.
      await page
        .locator('#workflows-panel')
        .getByRole('columnheader', { name: 'Name', exact: false })
        .getByRole('button')
        .first()
        .click();
      await firstRow.getByText('Zebra export', { exact: true }).waitFor();

      // Search narrows the whole list.
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Alpha');
      await firstRow.getByText('Alpha export', { exact: true }).waitFor();
      assert.equal(await page.locator('#workflows-panel table tbody tr').count(), 1);

      // No match: a no-results state distinct from the empty state, offering
      // to clear the search.
      await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Nonexistent');
      await page.getByText('No matching workflows', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Clear search', exact: true }).click();
      await firstRow.waitFor();
    },
  );
});

// Menu > Automation parity (New Workflow, View Run History) lives in
// menu.test.mjs alongside the other native-menu-command tests.
