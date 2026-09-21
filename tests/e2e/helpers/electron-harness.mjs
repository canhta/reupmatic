// Shared Electron e2e harness: isolated temp user-data dirs, app launch args/env,
// and screenshot-on-failure. Individual specs own their fixtures and assertions.
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { pythonExecutable } from '../../../scripts/python.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Writes a recovery draft straight through the same `ProjectRecovery`/
 * `createProject` core classes the running app uses (`dist-node/core`, a
 * build:node byproduct) so a seeded draft is real current-format storage, not
 * a hand-rolled fixture the host would never actually produce. Must run
 * before the app that owns `editor-recovery.sqlite` is launched.
 */
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

/** Writes a real saved project plus its Recent-store row through the same
 * `createProject`/`saveProject`/`RecentStore` core classes the running app uses
 * (`dist-node`, a build:node byproduct), so the header's Recent section has
 * genuine entries before the app launches. */
export async function seedSavedProject(
  userData,
  {
    path: projectPath,
    name,
    sourcePath,
    sourceSha256,
    cues = [],
    openedAt = Date.now(),
    // A seeded document may carry a real composition (the clips-limit spec opens
    // one that is already full); `createProject` validates it like any saved file.
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

/** Creates an isolated temp dir plus its `user-data` subdirectory. */
export async function createTempWorkspace(prefix) {
  const temp = await mkdtemp(path.join(os.tmpdir(), prefix));
  const userData = path.join(temp, 'user-data');
  await mkdir(userData);
  return { temp, userData };
}

/** Launches the app entrypoint against a given user-data dir. */
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

/** Stubs the native "quit with unsaved changes?" confirm to whichever answer
 * actually proceeds with closing — never the one at `options.cancelId`,
 * which would leave the window open and hang `application.close()`. Reading
 * `cancelId` instead of a fixed index or `buttons.length` keeps this correct
 * across every shape `confirmDialog` (main.ts) builds: the two-button
 * recovery-flush-failed and not-dirty-quit shapes both put their proceed
 * answer last (cancelId 0), but the three-button mac dirty-document shape
 * puts Save first and Cancel last (cancelId 2) — a fixed "always pick the
 * last button" assumption picks Cancel there instead. Any e2e spec that
 * leaves a document dirty and then closes the app (directly or via
 * `runElectronTest`'s own teardown) would otherwise hang on this dialog
 * until its own timeout: it blocks `application.close()` the same way it
 * blocks a real quit. Stubbed once, here, so no future test has to remember
 * its own copy — a spec that genuinely needs a different answer (e.g.
 * "Cancel") overwrites `dialog.showMessageBox` again after this call. */
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

/** Exported so a test can launch the app more than once against the same
 * `userData` (e.g. to prove a preference persists across a relaunch) without
 * going through `runElectronTest`, which always removes `temp` in its own
 * `finally` — safe for one launch, not for a sequence sharing one profile. */
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

/**
 * Runs `run({ application, page })` against a freshly launched app, saving a
 * screenshot to `.test-artifacts/<screenshotName>` on failure and always
 * closing the app and removing `temp` afterwards.
 */
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
