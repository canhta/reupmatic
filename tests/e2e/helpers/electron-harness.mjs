import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { pythonExecutable } from '../../../scripts/python.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Seeds through the real core classes; must run before the owning app launches. */
export async function seedRecoveryDraft(
  userData,
  { id, sourcePath, sourceSha256, cues, sampleEndMs = 2000 },
) {
  const workspace = path.join(userData, 'integration-workspace');
  await mkdir(workspace, { recursive: true });
  const { ProjectRecovery } = await import(
    path.join(root, 'dist-node/core/projects/recovery/project-recovery.js')
  );
  const { createProject } = await import(path.join(root, 'dist-node/core/projects/project.js'));
  const store = new ProjectRecovery(path.join(workspace, 'editor-recovery.sqlite'));
  try {
    store.save(
      id,
      0,
      createProject(
        { path: sourcePath, sha256: sourceSha256 },
        { cues, sample: { start_ms: 0, end_ms: sampleEndMs } },
      ),
    );
  } finally {
    store.close();
  }
}

/** Seeds a real saved project + Recent row through the core classes. */
export async function seedSavedProject(
  userData,
  {
    path: projectPath,
    name,
    sourcePath,
    sourceSha256,
    cues = [],
    openedAt = Date.now(),
    snapshot = {},
  },
) {
  const workspace = path.join(userData, 'integration-workspace');
  await mkdir(workspace, { recursive: true });
  const { createProject, saveProject } = await import(
    path.join(root, 'dist-node/core/projects/project.js')
  );
  const { RecentStore } = await import(
    path.join(root, 'dist-node/electron/features/projects/recent-store.js')
  );
  await saveProject(
    projectPath,
    createProject(
      { path: sourcePath, sha256: sourceSha256 },
      { name, cues, sample: { start_ms: 0, end_ms: 2000 }, ...snapshot },
    ),
  );
  const store = new RecentStore(path.join(workspace, 'recent.json'));
  await store.record({
    kind: 'project',
    id: projectPath,
    name,
    path: projectPath,
    source_path: sourcePath,
    opened_at: openedAt,
  });
}

export async function createTempWorkspace(prefix) {
  const temp = await mkdtemp(path.join(os.tmpdir(), prefix));
  const userData = path.join(temp, 'user-data');
  await mkdir(userData);
  return { temp, userData };
}

export async function launchElectronApp({ userData, env = {}, args = [] }) {
  return electron.launch({
    cwd: root,
    args: [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'tests/e2e/launch.mjs', ...args],
    env: {
      ...process.env,
      REUPMATIC_TEST_USER_DATA: userData,
      PYTHON: pythonExecutable(root),
      ...env,
    },
  });
}

/** Picks the button that is not options.cancelId; a wrong index hangs application.close(). */
export async function stubQuitConfirm(application) {
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => {
      const buttons = options?.buttons ?? [];
      const cancelId = options?.cancelId;
      const response = buttons.findIndex((_button, index) => index !== cancelId);
      return { response: Math.max(0, response), checkboxChecked: false };
    };
  });
}

async function saveFailureScreenshot(page, name) {
  if (!page || !name) return;
  const artifacts = path.join(root, '.test-artifacts');
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, name) }).catch(() => undefined);
}

/** Exported for relaunch specs; runElectronTest always removes temp in its finally. */
export async function firstAppWindow(application) {
  const firstWindow = await application.firstWindow();
  if (!firstWindow.url().startsWith('devtools://')) return firstWindow;

  const existingAppWindow = application
    .windows()
    .find((candidate) => !candidate.url().startsWith('devtools://'));
  if (existingAppWindow) return existingAppWindow;

  return application.waitForEvent('window', {
    predicate: (candidate) => !candidate.url().startsWith('devtools://'),
  });
}

export async function runElectronTest({ temp, userData, env, args, screenshotName }, run) {
  let application;
  let page;
  try {
    application = await launchElectronApp({ userData, env, args });
    await stubQuitConfirm(application);
    page = await firstAppWindow(application);
    return await run({ application, page });
  } catch (error) {
    await saveFailureScreenshot(page, screenshotName);
    throw error;
  } finally {
    if (application) await application.close().catch(() => undefined);
    await rm(temp, { recursive: true, force: true });
  }
}
