import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, net, session } from 'electron';

// React DevTools' Chrome Web Store id — stable for years; the extension itself is fetched,
// unzipped and cached under the app's userData on first dev launch.
const REACT_DEVTOOLS_ID = 'fmkadmapgofadopljbjfkapdkoienihi';

// Dev-only: install the React DevTools extension into the default session before the renderer
// window exists, so the detached DevTools window main.ts opens in development has a Components
// tab and catches the first render. The downloader/`unzip-crx-3` are devDependencies imported
// lazily, so nothing here is reached by a packaged build (which has no dev server URL). This is
// deliberately not `electron-devtools-installer`: it drives the now-deprecated `session.*`
// extension shims, whereas `session.extensions.*` is the supported surface.
export async function installReactDevTools(): Promise<void> {
  const extensionDirectory = path.join(app.getPath('userData'), 'extensions', REACT_DEVTOOLS_ID);
  if (!existsSync(path.join(extensionDirectory, 'manifest.json'))) {
    await downloadAndExtract(extensionDirectory);
  }

  const target = session.defaultSession;
  const extension = await target.extensions.loadExtension(extensionDirectory);
  // The extension is MV3: its background service worker registers the MAIN-world script that
  // installs the React hook. Electron starts that worker on the first launch only and leaves it
  // stopped afterwards (electron#41613), which silently leaves the Components tab empty and
  // makes React log its "Download the React DevTools" notice. Start it explicitly every launch.
  await target.serviceWorkers.startWorkerForScope(extension.url);
  console.log(`[devtools] React DevTools ${extension.name} ${extension.version}`);
}

async function downloadAndExtract(destination: string): Promise<void> {
  const url =
    'https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3' +
    `&x=id%3D${REACT_DEVTOOLS_ID}%26uc&prodversion=${process.versions.chrome}`;
  const response = await net.fetch(url);
  if (!response.ok) throw new Error(`extension download failed: HTTP ${response.status}`);

  const archive = `${destination}.crx`;
  await mkdir(path.dirname(archive), { recursive: true });
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  try {
    const { default: unzip } = await import('unzip-crx-3');
    await rm(destination, { recursive: true, force: true });
    await unzip(archive, destination);
  } finally {
    await rm(archive, { force: true });
  }
}
