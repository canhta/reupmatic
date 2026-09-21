// Verifies the runtime behaviour ticket 02 could not tick from code alone: that the advanced
// control is secondary and collapsed, that each rejection surfaces its own specific message, and
// that the pasted text never survives submission in the DOM. No Douyin request is made and no
// real session is used — every paste here is fabricated and is rejected before anything is
// written.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTempWorkspace, runElectronTest } from './helpers/electron-harness.mjs';
import { waitForEditorReady } from './ui-actions.mjs';

const SECRET = 'NEVERSURVIVESSUBMIT';

test('Douyin cookie entry stays secondary, rejects specifically, and keeps no paste', {
  timeout: 60000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-cookies-');
  await runElectronTest(
    { temp, userData, screenshotName: 'douyin-cookie-entry-failure.png' },
    async ({ page }) => {
      await page.setViewportSize({ width: 1420, height: 900 });
      await waitForEditorReady(page);
      await page.getByRole('button', { name: 'Sources & Library', exact: true }).click();
      await page.getByRole('tab', { name: 'Downloads', exact: true }).click();

      // Connect is the action; the advanced path is collapsed behind a disclosure, not a peer.
      await page.getByRole('button', { name: 'Connect Douyin', exact: true }).waitFor();
      // Collapsible keeps its content mounted, so this is a visibility check, not a DOM one.
      const field = page.getByLabel('Douyin cookies');
      assert.equal(await field.isVisible(), false, 'the cookie field is exposed before disclosure');

      await page.getByText('Paste cookies instead', { exact: true }).click();
      await field.waitFor({ state: 'visible' });

      // Unreadable and not-signed-in are different mistakes and get different messages.
      await field.fill('this is not a cookie string');
      await page.getByRole('button', { name: 'Use these cookies', exact: true }).click();
      await page
        .getByText('That does not look like cookies. Paste the whole cookie string.', {
          exact: true,
        })
        .waitFor();

      await field.fill(`ttwid=${SECRET}; odin_tt=anonymous`);
      await page.getByRole('button', { name: 'Use these cookies', exact: true }).click();
      await page
        .getByText(
          'Those cookies are not signed in to Douyin. Sign in first, then copy them again.',
          {
            exact: true,
          },
        )
        .waitFor();

      // The paste is a session secret: it must not linger anywhere in the document after
      // submission, accepted or not, and must not have reached the visible error either.
      const body = await page.locator('body').innerHTML();
      assert.ok(!body.includes(SECRET), 'the pasted cookie value survived submission in the DOM');

      // Status is unchanged: a rejected paste connects nothing.
      await page.getByText('Not connected', { exact: true }).first().waitFor();
    },
  );
});
