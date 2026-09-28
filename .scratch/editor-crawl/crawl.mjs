// Exploratory crawl of the Editor: every control in every tool/source panel, with real models.
// Owner-requested bug hunt (2026-09-26). Not a test: it records what breaks, it asserts nothing.
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createTempWorkspace,
  firstAppWindow,
  launchElectronApp,
  root,
  stubQuitConfirm,
} from '../../tests/e2e/helpers/electron-harness.mjs';
import {
  addMediaToProject,
  chooseLocale,
  waitForEditorReady,
} from '../../tests/e2e/ui-actions.mjs';

const out = path.join(root, '.scratch/editor-crawl/out');
await mkdir(out, { recursive: true });
const locale = process.argv[2] ?? 'en';
const { temp, userData } = await createTempWorkspace('reupmatic-crawl-');
const realWs = path.join(
  os.homedir(),
  'Library/Application Support/Reupmatic/integration-workspace',
);
const ws = path.join(userData, 'integration-workspace');
await mkdir(ws, { recursive: true });
for (const f of ['local-speech.json', 'local-models.json', 'local-translation.json']) {
  await copyFile(path.join(realWs, f), path.join(ws, f)).catch(() => undefined);
}

// Media: speech (macOS say) over a 9:16 test pattern with burned-in text, a music bed and a logo.
const ff = path.join(root, 'ffmpeg', 'ffmpeg');
const ffmpeg = (await readdir(path.join(root, 'ffmpeg')).catch(() => [])).includes('ffmpeg')
  ? ff
  : 'ffmpeg';
const speech = path.join(temp, 'speech.aiff');
execFileSync('say', [
  '-o',
  speech,
  'Hello and welcome. This is a short test video for the editor. Thank you for watching.',
]);
const video = path.join(temp, 'crawl.mp4');
execFileSync(
  ffmpeg,
  [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=720x1280:rate=30:duration=10',
    '-i',
    speech,
    '-vf',
    "drawtext=text='XIN CHAO':fontsize=72:fontcolor=white:x=(w-tw)/2:y=h-200:box=1:boxcolor=black",
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-af',
    'apad',
    '-t',
    '10',
    video,
  ],
  { stdio: 'ignore' },
);
const music = path.join(temp, 'music.m4a');
execFileSync(
  ffmpeg,
  ['-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', '-c:a', 'aac', music],
  { stdio: 'ignore' },
);
const logo = path.join(temp, 'logo.png');
execFileSync(
  ffmpeg,
  ['-y', '-f', 'lavfi', '-i', 'color=c=red:size=128x128:duration=1', '-frames:v', '1', logo],
  { stdio: 'ignore' },
);

const findings = [];
const log = (kind, where, detail) => {
  findings.push({ kind, where, detail });
  console.log(`[${kind}] ${where} :: ${String(detail).slice(0, 300)}`);
};

const application = await launchElectronApp({
  userData,
  env: { PYTHON: path.join(root, 'python/bin/python3') },
});
await stubQuitConfirm(application);
await application.evaluate(
  ({ dialog, shell }, files) => {
    dialog.showOpenDialog = async (_w, options) => {
      const exts = (options?.filters ?? []).flatMap((f) => f.extensions ?? []).join(',');
      const pick = /png|jpg|webp/.test(exts)
        ? files.logo
        : /m4a|mp3|wav|aac|flac/.test(exts) && !/mp4/.test(exts)
          ? files.music
          : files.video;
      return { canceled: false, filePaths: [pick] };
    };
    dialog.showSaveDialog = async (_w, options) => ({
      canceled: false,
      filePath: `${files.temp}/export-${Date.now()}${options?.defaultPath ? `-${options.defaultPath.split('/').pop()}` : '.mp4'}`,
    });
    shell.openExternal = async () => undefined;
    shell.openPath = async () => '';
    shell.showItemInFolder = () => undefined;
  },
  { video, music, logo, temp },
);

const page = await firstAppWindow(application);
page.on('pageerror', (error) => log('pageerror', current, error.message));
page.on('console', (message) => {
  if (message.type() === 'error') log('console', current, message.text());
});
let current = 'startup';
await waitForEditorReady(page);
if (locale !== 'en') {
  await chooseLocale(application, page, locale);
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
}
await addMediaToProject(page);
await page.locator('.viewers video').first().waitFor({ timeout: 30000 });

const SKIP = /^(delete|remove|discard|xoá|xóa|bỏ|close|đóng|set up|thiết lập|cài đặt|settings)\b/i;
const seenAlerts = new Set();
async function alerts() {
  const texts = await page
    .getByRole('alert')
    .allInnerTexts()
    .catch(() => []);
  for (const text of texts) {
    if (text.trim() && !seenAlerts.has(text)) {
      seenAlerts.add(text);
      log('alert', current, text.replace(/\s+/g, ' '));
    }
  }
}
async function settle() {
  const started = Date.now();
  await page.waitForTimeout(600);
  while (Date.now() - started < 180000) {
    const busy = await page
      .locator('[role="progressbar"]:visible')
      .count()
      .catch(() => 0);
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  if (Date.now() - started >= 180000) log('hang', current, 'progress still visible after 180 s');
}
async function closeOverlays() {
  for (let i = 0; i < 3; i += 1) {
    const open = await page
      .locator('[role="dialog"]:visible, [role="listbox"]:visible, [role="menu"]:visible')
      .count();
    if (!open) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

async function crawl(scopeSelector, name) {
  const scope = page.locator(scopeSelector).first();
  if (!(await scope.count())) return log('missing', name, `no ${scopeSelector}`);
  const controls =
    'button, [role="combobox"], [role="switch"], [role="checkbox"], input[type="checkbox"], [role="radio"], input[type="number"], input[type="text"], textarea';
  const done = new Set();
  for (let pass = 0; pass < 3; pass += 1) {
    const handles = await scope.locator(controls).all();
    let acted = false;
    for (const [index, control] of handles.entries()) {
      const label = (
        (await control.getAttribute('aria-label').catch(() => null)) ||
        (await control.innerText().catch(() => '')) ||
        (await control.getAttribute('placeholder').catch(() => '')) ||
        `#${index}`
      )
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60);
      const key = `${label}|${index}`;
      if (done.has(key) || SKIP.test(label)) continue;
      if (
        !(await control.isVisible().catch(() => false)) ||
        !(await control.isEnabled().catch(() => false))
      )
        continue;
      done.add(key);
      acted = true;
      current = `${name} › ${label}`;
      const role =
        (await control.getAttribute('role').catch(() => null)) ||
        (await control
          .evaluate((e) => e.tagName.toLowerCase() + (e.type ? `:${e.type}` : ''))
          .catch(() => ''));
      try {
        if (role === 'combobox') {
          await control.click({ timeout: 3000 });
          const options = page.getByRole('option');
          const count = await options.count();
          if (count > 1) await options.nth(1).click({ timeout: 3000 });
          else await page.keyboard.press('Escape');
        } else if (/input:(number|text)|textarea/.test(role)) {
          await control.fill(role.includes('number') ? '2' : 'Crawl text', { timeout: 3000 });
          await control.press('Tab');
        } else {
          await control.click({ timeout: 3000 });
        }
      } catch (error) {
        log('interaction', current, error.message.split('\n')[0]);
      }
      await settle();
      await alerts();
      if (
        !(await page
          .locator('.editor-workspace')
          .isVisible()
          .catch(() => false))
      ) {
        log('navigated-away', current, 'control left the Editor');
        await page
          .getByRole('button', { name: /^(Editor|Biên tập)$/ })
          .first()
          .click()
          .catch(() => undefined);
        await page.waitForTimeout(800);
        if (name.startsWith('tool-'))
          await page
            .locator(`.editor-tool-rail [data-rail-item="${name.slice(5)}"]`)
            .click()
            .catch(() => undefined);
      }
      const dialog = page.locator('[role="dialog"]:visible');
      if (await dialog.count()) {
        await page
          .screenshot({ path: path.join(out, `${locale}-${name}-${index}-dialog.png`) })
          .catch(() => undefined);
        await closeOverlays();
      }
    }
    if (!acted) break;
  }
  await page.screenshot({ path: path.join(out, `${locale}-${name}.png`) }).catch(() => undefined);
}

for (const tool of ['transcribe', 'translate', 'voice', 'style', 'clean-up', 'audio', 'edit']) {
  current = `open tool ${tool}`;
  await page
    .locator(`.editor-tool-rail [data-rail-item="${tool}"]`)
    .click()
    .catch((error) => log('missing', current, error.message.split('\n')[0]));
  await page.waitForTimeout(500);
  await crawl(`#panel-${tool}`, `tool-${tool}`);
  await closeOverlays();
}
for (const source of await page
  .locator('.editor-source-rail [data-rail-item]')
  .evaluateAll((els) => els.map((e) => e.getAttribute('data-rail-item')))) {
  current = `open source ${source}`;
  await page
    .locator(`.editor-source-rail [data-rail-item="${source}"]`)
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(500);
  await crawl('.editor-side-panel:not(.editor-tool-panel)', `source-${source}`);
  await closeOverlays();
}
await crawl('.viewers', 'monitor');
await crawl('.editor-timeline-region', 'timeline');
await crawl('.editor-feedback, header', 'header');

const logs = path.join(userData, 'logs');
for (const file of await readdir(logs).catch(() => [])) {
  for (const line of (await readFile(path.join(logs, file), 'utf8')).split('\n')) {
    if (/"level":"(error|warn)"/.test(line)) log('diagnostic', file, line);
  }
}
await writeFile(path.join(out, `findings-${locale}.json`), JSON.stringify(findings, null, 2));
await application.close().catch(() => undefined);
console.log(`DONE ${findings.length} findings → ${out}`);
