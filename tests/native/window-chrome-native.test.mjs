import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveWindowChrome,
  WINDOW_CHROME_COLORS,
  WINDOW_CHROME_TOOLBAR_HEIGHT,
} from '../../dist-node/electron/runtime/window-chrome.js';

test('macOS keeps the hiddenInset traffic-light treatment, regardless of isDark', () => {
  for (const isDark of [true, false]) {
    assert.deepEqual(resolveWindowChrome('darwin', isDark), {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 14, y: 17 },
    });
  }
});

for (const platform of ['win32', 'linux']) {
  test(`${platform} gets a Window Controls Overlay matching the shell's toolbar band`, () => {
    const dark = resolveWindowChrome(platform, true);
    const light = resolveWindowChrome(platform, false);
    assert.equal(dark.titleBarStyle, 'hidden');
    assert.equal(light.titleBarStyle, 'hidden');
    // Must match --shell-toolbar-h (app/ui/design-tokens.css) so the OS-drawn caption buttons
    // line up with the app's own toolbar band instead of a second, mismatched strip.
    assert.equal(dark.titleBarOverlay.height, WINDOW_CHROME_TOOLBAR_HEIGHT);
    assert.equal(light.titleBarOverlay.height, WINDOW_CHROME_TOOLBAR_HEIGHT);
    assert.equal(dark.titleBarOverlay.color, WINDOW_CHROME_COLORS.dark.background);
    assert.equal(dark.titleBarOverlay.symbolColor, WINDOW_CHROME_COLORS.dark.symbol);
    assert.equal(light.titleBarOverlay.color, WINDOW_CHROME_COLORS.light.background);
    assert.equal(light.titleBarOverlay.symbolColor, WINDOW_CHROME_COLORS.light.symbol);
    assert.notEqual(dark.titleBarOverlay.color, light.titleBarOverlay.color);
  });
}

test("defaults to dark when isDark is omitted (today's only shipped theme)", () => {
  const chrome = resolveWindowChrome('win32');
  assert.equal(chrome.titleBarStyle, 'hidden');
  assert.equal(chrome.titleBarOverlay.color, WINDOW_CHROME_COLORS.dark.background);
});

test('every platform resolves to exactly one recognized title-bar style', () => {
  for (const platform of ['darwin', 'win32', 'linux', 'freebsd']) {
    assert.ok(
      ['hiddenInset', 'hidden'].includes(resolveWindowChrome(platform, true).titleBarStyle),
    );
  }
});
