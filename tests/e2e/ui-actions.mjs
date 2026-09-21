const languageNames = { en: 'English', vi: 'Tiếng Việt' };

/** Waits for the Editor's empty-state shell to finish mounting: the header
 * project title (D-63) reading "Untitled project", the one accessible signal
 * every area shares at a fresh launch now that the old empty-state buttons are
 * gone. */
export async function waitForEditorReady(page) {
  await page.getByRole('button', { name: 'Untitled project', exact: true }).waitFor();
}

/** Adds media into the open project through the Media panel's own Add… control
 * (D-63) — how a first video now starts a project. Opens that panel from the
 * source rail first if another one is showing. The caller's own
 * `dialog.showOpenDialog` stub supplies the file. */
export async function addMediaToProject(page) {
  const before = await openSourcePanel(page, 'media');
  await page.locator('.project-media > button').first().click();
  // Leave the column where the test found it: adding media is the action, the
  // Media panel is only how it is reached.
  if (before && before !== 'media') await openSourcePanel(page, before);
}

/** Opens one of the left rail's panels ('media' or 'cues') if it is not already
 * the open one; clicking the open item would close the column instead. */
export async function openSourcePanel(page, id) {
  const open = await page.evaluate(() =>
    document
      .querySelector('.editor-source-rail [role="tab"][aria-selected="true"]')
      ?.getAttribute('data-rail-item'),
  );
  if (open !== id)
    await page.locator(`.editor-source-rail [role="tab"][data-rail-item="${id}"]`).click();
  return open ?? null;
}

/** Waits for every running transition/animation (menu popovers, panels) to
 * finish before a screenshot: Astryx surfaces fade/scale in, and a viewport
 * resize re-triggers that, so a screenshot taken immediately captures the
 * popover mid-entrance with no surface painted yet. */
export async function settleAnimations(page) {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

/** Adds a cue at the playhead via the cue list toolbar's own always-visible
 * "Add cue" button, not one of that row's overflow-menu items (M6/#7: "+"
 * always visible, not buried in a menu). */
export async function addCue(page) {
  await openSourcePanel(page, 'cues');
  await page.getByRole('button', { name: 'Add cue', exact: true }).click();
}

/** The status bar's notification bell. Its accessible name carries the unread count, so callers
 * assert against it before opening; opening marks the list read (owner). */
export function notificationBell(page) {
  return page.locator('.workspace-status-notifications button');
}

/** Opens the notification centre and returns its list surface (an Astryx Popover, role dialog
 * named by `title`). Waits for the surface so callers can query rows immediately. */
export async function openNotifications(page, title) {
  await notificationBell(page).click();
  const panel = page.getByRole('dialog', { name: title, exact: true });
  await panel.waitFor();
  return panel;
}

/** Invokes a top-level native menu's item by label, exactly as a user's
 * click would — shared so a spec can prove menu/button parity without a
 * second copy of this Electron-menu lookup (see menu.test.mjs). */
export async function clickMenuItem(application, menuLabel, itemLabel) {
  await application.evaluate(
    ({ Menu }, [menuLabel, itemLabel]) => {
      const menu = Menu.getApplicationMenu();
      const top = menu.items.find((item) => item.label === menuLabel);
      if (!top) throw new Error(`Menu not found: ${menuLabel}`);
      const item = top.submenu.items.find((entry) => entry.label === itemLabel);
      if (!item) throw new Error(`Menu item not found: ${menuLabel} > ${itemLabel}`);
      item.click();
    },
    [menuLabel, itemLabel],
  );
}

/** Navigates to the Settings destination via the sidebar's own bottom-anchored utility-slot item
 * (D-57 rehosts Settings in the main window's `WorkspaceNavigation`, superseding D-47's
 * independent window) and waits for its category tab strip to render. Lands on whichever
 * category was last selected — General on a fresh launch — the same in-page persistence every
 * other peer area's own state already gets across an area switch. Returns `page` itself: there
 * is only one window/Page now, so callers that used to hold a separate `settingsPage` keep the
 * same query surface. */
export async function openSettingsArea(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings categories' }).waitFor();
  return page;
}

/** Changes the UI locale through the Settings destination (D-57) and waits for it to take
 * effect. A same-page combobox now, not a second window (see app/ui/shell/useLocaleSync.ts) —
 * `application` stays a parameter for call-site compatibility though this no longer needs it. */
export async function chooseLocale(_application, page, locale) {
  if (!Object.hasOwn(languageNames, locale)) throw new Error(`Unsupported UI locale: ${locale}`);
  await openSettingsArea(page);
  const language = page.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true });
  await language.waitFor();
  await language.click();
  await page.getByRole('option', { name: languageNames[locale], exact: true }).click();
  await page.waitForFunction((language) => document.documentElement.lang === language, locale);
}

/** The vertical rows of one `InspectorPanelSection` (a tool panel's own section): the direct
 * children of its inner Astryx `Stack`, or of the section body when it has no Stack. Used to
 * prove a panel's rows cannot paint over one another — the defect ticket 02's review found in
 * the Transcribe panel's inline engine line. Returns each row's label, box and text. */
export async function panelSectionRows(section) {
  return section.evaluate((element) => {
    const inner = element.querySelector(':scope > *') ?? element;
    const stack = inner.querySelector('.astryx-stack');
    const nodes = Array.from((stack ?? inner).children);
    return nodes
      .filter((node) => {
        if (node.tagName === 'TEMPLATE') return false;
        const rect = node.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          label: (node.textContent || '').trim().slice(0, 40) || node.tagName.toLowerCase(),
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
      });
  });
}

/** Asserts no two of a section's rows intersect — the visual guarantee that a panel's contents
 * never overlap at any width or in any locale. Returns the rows it checked for reporting. */
export function assertSectionRowsDoNotOverlap(rows, label) {
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      const intersects =
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      if (intersects) {
        throw new Error(
          `${label}: rows overlap — "${a.label}" (${Math.round(a.top)}–${Math.round(a.bottom)}) ` +
            `and "${b.label}" (${Math.round(b.top)}–${Math.round(b.bottom)})`,
        );
      }
    }
  }
  return rows;
}
