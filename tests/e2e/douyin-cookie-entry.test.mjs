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

      await page.getByRole('button', { name: 'Connect Douyin', exact: true }).waitFor();
      const field = page.getByLabel('Douyin cookies');
      assert.equal(await field.isVisible(), false, 'the cookie field is exposed before disclosure');

      await page.getByText('Paste cookies instead', { exact: true }).click();
      await field.waitFor({ state: 'visible' });

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

      // Session secret must not linger in the DOM after submission, accepted or not.
      const body = await page.locator('body').innerHTML();
      assert.ok(!body.includes(SECRET), 'the pasted cookie value survived submission in the DOM');

      await page.getByText('Not connected', { exact: true }).first().waitFor();
    },
  );
});
