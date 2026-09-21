const languageNames = { en: 'English', vi: 'Tiếng Việt' };

export async function waitForEditorReady(page) {
  await page.getByRole('button', { name: 'Untitled project', exact: true }).waitFor();
}

export async function addMediaToProject(page) {
  const before = await openSourcePanel(page, 'media');
  await page.locator('.project-media > button').first().click();
  if (before && before !== 'media') await openSourcePanel(page, before);
}

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

// Astryx surfaces fade in and a resize re-triggers it; wait before screenshotting.
export async function settleAnimations(page) {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

export async function addCue(page) {
  await openSourcePanel(page, 'cues');
  await page.getByRole('button', { name: 'Add cue', exact: true }).click();
}

export function notificationBell(page) {
  return page.locator('.workspace-status-notifications button');
}

export async function openNotifications(page, title) {
  await notificationBell(page).click();
  const panel = page.getByRole('dialog', { name: title, exact: true });
  await panel.waitFor();
  return panel;
}

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

export async function openSettingsArea(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings categories' }).waitFor();
  return page;
}

// `application` is unused; kept for call-site compatibility.
export async function chooseLocale(_application, page, locale) {
  if (!Object.hasOwn(languageNames, locale)) throw new Error(`Unsupported UI locale: ${locale}`);
  await openSettingsArea(page);
  const language = page.getByRole('combobox', { name: 'Language / Ngôn ngữ', exact: true });
  await language.waitFor();
  await language.click();
  await page.getByRole('option', { name: languageNames[locale], exact: true }).click();
  await page.waitForFunction((language) => document.documentElement.lang === language, locale);
}

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
