// Shared CDP-driven IME composition helper. Not `.fill()`/`.type()` — those
// bypass composition entirely and would pass even if IME input were broken.

/** Drives a real IME composition through CDP: an in-progress underlined
 * composition (imeSetComposition) followed by the commit a user's IME would
 * perform (insertText). */
export async function composeText(page, locator, text) {
  const cdp = await page.context().newCDPSession(page);
  await locator.click();
  await cdp.send('Input.imeSetComposition', {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
  await cdp.send('Input.insertText', { text });
  await cdp.detach().catch(() => undefined);
}
