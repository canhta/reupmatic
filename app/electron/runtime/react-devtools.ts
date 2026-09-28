import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app, net, session } from 'electron';

// React DevTools' Chrome Web Store id.
const REACT_DEVTOOLS_ID = 'fmkadmapgofadopljbjfkapdkoienihi';

// Dev-only; uses session.extensions.*, not electron-devtools-installer's deprecated shims.
export async function installReactDevTools(): Promise<void> {
  const extensionDirectory = path.join(app.getPath('userData'), 'extensions', REACT_DEVTOOLS_ID);
  if (!existsSync(path.join(extensionDirectory, 'manifest.json'))) {
    await downloadAndExtract(extensionDirectory);
  }

  const target = session.defaultSession;
  const extension = await target.extensions.loadExtension(extensionDirectory);
  // MV3 worker stops after first launch (electron#41613); start it every launch.
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
