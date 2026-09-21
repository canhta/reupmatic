// Real Electron/Playwright/CDP against the Settings destination — a sidebar area in the one main
// window (D-57, ticket 10), not a second Playwright Page.
//
// Ticket 08 built the hosted-provider surface, but no protocol adapter existed yet, so the
// section hid itself and this file asserted that absence. Ticket 06 implements the first
// protocol (dashscope) — IMPLEMENTED_PROTOCOLS is no longer empty, so the section now appears
// and Add can genuinely succeed. This restores the add-provider dialog's own coverage deferred
// from ticket 08: IME-composed Vietnamese input (real composition events, not `.fill()`),
// forward focus order across every control, a disabled Save never taking keyboard focus, and
// real screenshots of the populated form in both locales at 1420×900 and 1050×700.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace, root, runElectronTest } from './helpers/electron-harness.mjs';
import { composeText } from './helpers/ime.mjs';
import { openSettingsArea, waitForEditorReady } from './ui-actions.mjs';

const DISCLAIMERS = [
  /No protocol is available yet/i,
  /not yet/i,
  /coming soon/i,
  /chưa có giao thức/i,
  /sắp ra mắt/i,
];

async function openProcessing(settings, categoryLabel, speechRowLabel) {
  await settings.getByRole('button', { name: categoryLabel, exact: true }).click();
  await settings.getByText(speechRowLabel, { exact: true }).first().waitFor();
}

function assertNoDisclaimer(text) {
  for (const pattern of DISCLAIMERS) {
    assert.ok(
      !pattern.test(text),
      `user-facing copy must not carry a build-state disclaimer; matched ${pattern}`,
    );
  }
}

async function focusedDescription(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName;
  });
}

test('Hosted providers: appears once a protocol is implemented, dialog IME/focus/screenshots restored', {
  timeout: 90000,
}, async () => {
  const { temp, userData } = await createTempWorkspace('reupmatic-speech-providers-');
  await runElectronTest(
    { temp, userData, screenshotName: 'speech-providers-failure.png' },
    async ({ page }) => {
      await waitForEditorReady(page);
      const settings = await openSettingsArea(page);
      await openProcessing(settings, 'AI & processing', 'Speech recognition');

      // The section is present now, with a genuinely usable Add affordance.
      await settings.getByRole('heading', { name: 'Hosted providers', exact: true }).waitFor();
      // An empty provider list renders the affordance twice (header action + empty-state
      // action) — the header one is what a populated list keeps, so drive that one.
      const addButton = settings
        .getByRole('button', { name: 'Add provider…', exact: true })
        .first();
      await addButton.waitFor();
      assert.ok(
        (await settings.getByRole('button', { name: 'Add provider…', exact: true }).count()) >= 1,
      );
      assertNoDisclaimer(await settings.evaluate(() => document.body.innerText));

      // Open the dialog and drive its display-name field through a real IME composition —
      // .fill()/.type() bypass composition entirely and would pass even if IME input broke.
      await addButton.click();
      const dialogTitle = settings.getByRole('heading', { name: 'Add provider', exact: true });
      await dialogTitle.waitFor();
      const displayName = settings.getByRole('textbox', { name: 'Display name' });
      await displayName.waitFor();
      await composeText(settings, displayName, 'Nhà cung cấp Việt Nam');
      assert.equal(await displayName.inputValue(), 'Nhà cung cấp Việt Nam');

      // Forward focus order across every control, starting from the auto-focused display
      // name field: never lost to <body> (a focus trap), and the Save button — still disabled
      // with the form incomplete — must never take keyboard focus along the way.
      const saveButton = settings.getByRole('button', { name: 'Save provider', exact: true });
      assert.equal(await saveButton.isDisabled(), true);
      await saveButton.focus();
      assert.notEqual(await focusedDescription(settings), 'Save provider');

      await displayName.focus();
      const seen = [];
      for (let i = 0; i < 6; i += 1) {
        await settings.keyboard.press('Tab');
        seen.push(await focusedDescription(settings));
      }
      assert.ok(
        seen.every((label) => label !== null),
        `focus should never fall back to <body> inside the dialog; saw: ${JSON.stringify(seen)}`,
      );
      assert.ok(
        !seen.includes('Save provider'),
        `the disabled Save button must not be reachable by Tab while the form is incomplete; saw: ${JSON.stringify(seen)}`,
      );

      // Complete the form: protocol, endpoint host, credential.
      await settings.getByRole('combobox', { name: 'Protocol' }).click();
      await settings.getByRole('option', { name: 'dashscope', exact: true }).click();
      await settings.getByRole('textbox', { name: 'Endpoint host' }).fill('dashscope.aliyuncs.com');
      // A password field carries no implicit ARIA textbox role — targeted by its label instead.
      await settings.getByLabel('Credential').fill('e2e-test-credential');
      assert.equal(await saveButton.isDisabled(), false);

      // Now the completed form's own tab order reaches Save and Cancel without a trap either.
      await displayName.focus();
      const populatedSeen = [];
      for (let i = 0; i < 6; i += 1) {
        await settings.keyboard.press('Tab');
        populatedSeen.push(await focusedDescription(settings));
      }
      assert.ok(
        populatedSeen.every((label) => label !== null),
        `focus should never fall back to <body>; saw: ${JSON.stringify(populatedSeen)}`,
      );
      assert.ok(populatedSeen.includes('Save provider'));
      assert.ok(populatedSeen.includes('Cancel'));

      const screenshots = path.join(root, '.test-artifacts');
      await mkdir(screenshots, { recursive: true });
      await settings.emulateMedia({ reducedMotion: 'reduce' });
      for (const [width, height] of [
        [1420, 900],
        [1050, 700],
      ]) {
        await settings.setViewportSize({ width, height });
        await settings.screenshot({
          path: path.join(screenshots, `speech-providers-en-${width}x${height}.png`),
          fullPage: true,
        });
      }
      await settings.setViewportSize({ width: 1420, height: 900 });

      await saveButton.click();
      await dialogTitle.waitFor({ state: 'detached' });
      await settings.getByText('Nhà cung cấp Việt Nam').first().waitFor();

      // Vietnamese ships with English: the section, its Add affordance and the dialog's own
      // fields all work the same way, with no disclaimer copy either.
      await settings.getByRole('button', { name: 'General', exact: true }).click();
      const language = settings.getByRole('combobox', {
        name: 'Language / Ngôn ngữ',
        exact: true,
      });
      await language.click();
      await settings.getByRole('option', { name: 'Tiếng Việt', exact: true }).click();
      await settings.waitForFunction(() => document.documentElement.lang === 'vi');

      await openProcessing(settings, 'AI & xử lý', 'Nhận dạng giọng nói');
      await settings.getByRole('heading', { name: 'Nhà cung cấp riêng', exact: true }).waitFor();
      const addButtonVi = settings.getByRole('button', {
        name: 'Thêm nhà cung cấp…',
        exact: true,
      });
      await addButtonVi.waitFor();
      const vietnameseText = await settings.evaluate(() => document.body.innerText);
      assertNoDisclaimer(vietnameseText);
      // Astryx's own rendered strings are overridden through an allowlist
      // (app/ui/design-system/component-messages.ts): a key missing there renders the English
      // default on a Vietnamese screen, which is how "Required" reached this dialog.
      assert.ok(
        !/\bRequired\b/.test(vietnameseText),
        'an Astryx string rendered in English on the Vietnamese screen',
      );

      await addButtonVi.click();
      const displayNameVi = settings.getByRole('textbox', { name: 'Tên hiển thị' });
      await displayNameVi.waitFor();
      await composeText(settings, displayNameVi, 'Nhà cung cấp thứ hai — Đà Nẵng');
      assert.equal(await displayNameVi.inputValue(), 'Nhà cung cấp thứ hai — Đà Nẵng');
      await settings.getByRole('combobox', { name: 'Giao thức' }).click();
      await settings.getByRole('option', { name: 'dashscope', exact: true }).click();
      await settings
        .getByRole('textbox', { name: 'Địa chỉ máy chủ' })
        .fill('dashscope.aliyuncs.com');
      await settings.getByLabel('Khoá truy cập').fill('e2e-test-credential-vi');

      for (const [width, height] of [
        [1420, 900],
        [1050, 700],
      ]) {
        await settings.setViewportSize({ width, height });
        await settings.screenshot({
          path: path.join(screenshots, `speech-providers-vi-${width}x${height}.png`),
          fullPage: true,
        });
      }

      await settings.close();
    },
  );
});
