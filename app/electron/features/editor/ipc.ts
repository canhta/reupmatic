import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { type BrowserWindow, dialog } from 'electron';
import { parseComposition } from '../../../core/editing/composition/document.js';
import { parseEditing } from '../../../core/editing/edit-recipe.js';
import { parseProjectMedia } from '../../../core/editing/project-media.js';
import type { Soundtrack } from '../../../core/editing/soundtrack.js';
import { saveChosenExport } from '../../../core/media/files.js';
import { createProject, loadProject, saveProject } from '../../../core/projects/project.js';
import type { RecentEntry } from '../../../core/projects/recent.js';
import type { RenderCoordinator, RenderInput } from '../../../core/rendering/render-coordinator.js';
import { assertCues } from '../../../core/subtitles/cues.js';
import { parseSubtitleStyle } from '../../../core/subtitles/style.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { type IpcWire, requestRecord, requestRevision } from '../../runtime/ipc.js';
import type { installLibrary } from '../library/ipc.js';
import {
  audioFilters,
  editorImportFilters,
  imageFilters,
  type MediaRegistry,
  subtitleFilters,
  videoFilters,
} from '../media/registry.js';
import { authorizeSnapshot, restoreProjectSnapshot } from '../projects/dependencies.js';
import { RecentStore } from '../projects/recent-store.js';
import { installAudio } from './audio/ipc.js';
import { installComposition } from './composition/ipc.js';

interface Host {
  wire: IpcWire;
  getWindow(): BrowserWindow;
  getLanguage(): string;
  worker: WorkerClient;
  renderer: RenderCoordinator;
  media: MediaRegistry;
  library: Awaited<ReturnType<typeof installLibrary>>;
  workspace: string;
  savePath(name: string): string;
  /** Runs after the Recent (videos/projects) list changes — main.ts rebuilds the native File >
   * Open Recent submenu from it; the renderer's own copy refreshes off the 'recent-changed'
   * event this also sends. */
  onRecentChanged?(): void;
}

export function installEditor(host: Host): { recentList(): Promise<RecentEntry[]> } {
  const { wire, worker, media } = host;
  installAudio(host);
  installComposition(host);
  const recent = new RecentStore(path.join(host.workspace, 'recent.json'));
  async function recordRecent(entry: RecentEntry) {
    await recent.record(entry);
    const window = host.getWindow();
    if (!window.isDestroyed()) window.webContents.send('reupmatic:recent-changed');
    host.onRecentChanged?.();
  }
  wire('hello', () => worker.request('hello', {}).result);
  wire('open', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: videoFilters,
    });
    if (chosen.canceled) return null;
    // A video is not a Recent item any more (D-63): it enters the open
    // project as Project media, and the Recent list holds projects only.
    const video = await media.registerVideo(chosen.filePaths[0]);
    return media.publicVideo(video);
  });
  // Dropping a file on the viewer resolves to a real path client-side (webUtils.getPathForFile,
  // preload.cts) with no OS file-type filter of its own, unlike the open dialog above — this
  // extension check is what actually enforces the same video-only rule for that path.
  wire('open-path', async (input) => {
    const extension = path.extname(input.path).slice(1).toLowerCase();
    if (!videoFilters.some((filter) => filter.extensions.includes(extension))) {
      throw new Error('UNSUPPORTED_VIDEO_FORMAT');
    }
    const video = await media.registerVideo(input.path);
    return media.publicVideo(video);
  });
  wire('recent-list', () => recent.list());
  // One native dialog for every kind Project media accepts (D-63, ED-P01). The
  // kind follows the chosen extension: a video or still image is added to Project
  // media only, audio becomes the project soundtrack and an SRT comes back with the
  // cues its text layer would receive, applied by the renderer through the existing
  // overwrite confirm. `editorImportFilters` is the Library allowlist plus images,
  // so the picker can never offer a file the import path refuses. The Logo section
  // calls it with `kind: 'image'`: the same dialog, filtered to PNG/JPEG only.
  wire('import-media', async (input) => {
    const kind = (input as { kind?: unknown } | undefined)?.kind;
    if (kind !== undefined && kind !== 'image') throw new Error('INVALID_REQUEST');
    const imageOnly = kind === 'image';
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: imageOnly ? imageFilters : editorImportFilters,
    });
    if (chosen.canceled || !chosen.filePaths[0]) return null;
    const extension = path.extname(chosen.filePaths[0]).slice(1).toLowerCase();
    if (imageOnly) {
      if (!imageFilters[0].extensions.includes(extension))
        throw new Error('UNSUPPORTED_IMAGE_FORMAT');
      const image = await media.registerImage(chosen.filePaths[0]);
      return {
        kind: 'image',
        media: {
          id: randomUUID(),
          kind: 'image',
          path: image.path,
          name: image.name,
          sha256: image.sha256,
        },
      };
    }
    if (subtitleFilters[0].extensions.includes(extension)) {
      const subtitle = await media.registerSubtitle(chosen.filePaths[0]);
      const loaded = await worker.request('subtitles.load', { asset_id: subtitle.asset_id }).result;
      return {
        kind: 'subtitle',
        media: {
          id: randomUUID(),
          kind: 'subtitle',
          path: subtitle.path,
          name: subtitle.name,
          sha256: subtitle.sha256,
        },
        cues: loaded.cues,
      };
    }
    if (imageFilters[0].extensions.includes(extension)) {
      const image = await media.registerImage(chosen.filePaths[0]);
      return {
        kind: 'image',
        media: {
          id: randomUUID(),
          kind: 'image',
          path: image.path,
          name: image.name,
          sha256: image.sha256,
        },
      };
    }
    if (audioFilters.some((filter) => filter.extensions.includes(extension))) {
      const { source } = await media.registerAudio(chosen.filePaths[0]);
      return { kind: 'audio', source };
    }
    const video = await media.registerVideo(chosen.filePaths[0]);
    return {
      kind: 'video',
      media: {
        id: randomUUID(),
        kind: 'video',
        path: video.path,
        name: video.name,
        sha256: video.sha256,
        duration_ms: video.duration_ms,
      },
    };
  });
  // A video dropped on the viewer while a project is already open: registered
  // and returned as a Project media row, never a replacement source (D-63).
  wire('media-add-path', async (input) => {
    const extension = path.extname(input.path).slice(1).toLowerCase();
    if (!videoFilters.some((filter) => filter.extensions.includes(extension))) {
      throw new Error('UNSUPPORTED_VIDEO_FORMAT');
    }
    const video = await media.registerVideo(input.path);
    return {
      id: randomUUID(),
      kind: 'video' as const,
      path: video.path,
      name: video.name,
      sha256: video.sha256,
      duration_ms: video.duration_ms,
    };
  });
  // Reading an already-added subtitle file back into cues. The sha256 the file
  // has now must match the saved one, so a changed file is refused (SOURCE_CHANGED)
  // rather than silently replacing a text layer with different captions.
  wire('media-load', async (input) => {
    const [value] = parseProjectMedia([requestRecord(input, ['media']).media]);
    if (value.kind !== 'subtitle') throw new Error('INVALID_REQUEST');
    const subtitle = await media.registerSubtitle(value.path);
    if (subtitle.sha256 !== value.sha256) throw new Error('SOURCE_CHANGED');
    return {
      cues: (await worker.request('subtitles.load', { asset_id: subtitle.asset_id }).result).cues,
    };
  });
  // A stored Project media file that may have moved. Re-choosing it re-registers
  // the file and compares the fresh sha256 against the saved one, exactly as
  // `restoreProjectAudio` does for the soundtrack (SOURCE_CHANGED on mismatch).
  wire('media-relink', async (input) => {
    const [value] = parseProjectMedia([requestRecord(input, ['media']).media]);
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: { video: videoFilters, image: imageFilters, subtitle: subtitleFilters }[value.kind],
      defaultPath: value.path.startsWith('\\\\') ? undefined : value.path,
    });
    if (chosen.canceled || !chosen.filePaths[0]) return null;
    if (value.kind === 'image') {
      const image = await media.registerImage(chosen.filePaths[0]);
      if (image.sha256 !== value.sha256) throw new Error('SOURCE_CHANGED');
      return { media: { ...value, path: image.path, name: image.name, sha256: image.sha256 } };
    }
    if (value.kind === 'video') {
      const video = await media.registerVideo(chosen.filePaths[0]);
      if (video.sha256 !== value.sha256) throw new Error('SOURCE_CHANGED');
      return {
        media: {
          ...value,
          path: video.path,
          name: video.name,
          sha256: video.sha256,
          duration_ms: video.duration_ms,
        },
      };
    }
    const subtitle = await media.registerSubtitle(chosen.filePaths[0]);
    if (subtitle.sha256 !== value.sha256) throw new Error('SOURCE_CHANGED');
    return {
      media: { ...value, path: subtitle.path, name: subtitle.name, sha256: subtitle.sha256 },
    };
  });
  // Existence check for the stored Project media files: the section shows a
  // relink row without waiting for an import attempt to fail. The primary video,
  // composition clips and soundtrack are relinked by the open flow itself.
  wire('media-check', async (input) => {
    const items = parseProjectMedia(requestRecord(input, ['items']).items);
    const missing: string[] = [];
    for (const item of items) {
      try {
        await access(item.path);
      } catch {
        missing.push(item.id);
      }
    }
    return { missing };
  });
  // The monitor's logo preview reads the image through `media://local/...` (the app CSP
  // blocks `file:`). Re-registering checks the sha256 first, so a moved-and-changed file
  // is refused (SOURCE_CHANGED) rather than shown.
  wire('media-url', async (input) => {
    const [value] = parseProjectMedia([requestRecord(input, ['media']).media]);
    if (value.kind !== 'image') throw new Error('INVALID_REQUEST');
    const image = await media.registerImage(value.path);
    if (image.sha256 !== value.sha256) throw new Error('SOURCE_CHANGED');
    return { url: image.url };
  });
  wire('ass', async (input) => {
    const value = requestRecord(input, ['cues', 'revision', 'style', 'asset_id']);
    assertCues(value.cues);
    const revision = requestRevision(value.revision);
    const source = media.getVideo(value.asset_id);
    return {
      revision,
      ...(await worker.request(
        'subtitles.preview',
        {
          cues: value.cues,
          canvas: { width: source.width, height: source.height },
          ...(value.style === undefined ? {} : { style: parseSubtitleStyle(value.style) }),
        },
        revision,
      ).result),
    };
  });
  wire('peaks', (input) => {
    const source = media.getVideo(requestRecord(input, ['asset_id']).asset_id);
    return worker.request('media.peaks', { asset_id: source.asset_id }).result;
  });
  wire('render', (input) => {
    const value = requestRecord(input, [
      'request_id',
      'asset_id',
      'cues',
      'revision',
      'mode',
      'encoding',
      'start_ms',
      'end_ms',
      'processing',
      'soundtrack',
      'composition',
      'voice',
      'logo',
    ]);
    media.getVideo(value.asset_id);
    if (value.composition) media.authorizeComposition(parseComposition(value.composition));
    if (value.soundtrack) media.authorizeSoundtrack(value.soundtrack as Soundtrack);
    const ticket = host.renderer.start(value as unknown as RenderInput);
    return { request_id: ticket.id, revision: requestRevision(value.revision) };
  });
  wire('cancel', (input) => host.renderer.cancel(input.request_id));
  wire('save-project', async (input) => {
    const value = requestRecord(input, ['asset_id', 'revision', 'snapshot', 'path']);
    const revision = requestRevision(value.revision);
    const source = media.getVideo(value.asset_id);
    const project = createProject({ path: source.path, sha256: source.sha256 }, value.snapshot);
    authorizeSnapshot(media, source, project);
    // A project opened from or already saved to a file writes straight back to
    // it; only a never-saved project picks a destination (Save As, first Save).
    let filePath: string;
    if (value.path === undefined) {
      // The project's own name is the suggested file name; illegal filename
      // characters fall back to the source basename rather than being written.
      const unsafeName =
        /[\\/:*?"<>|]/.test(project.name) ||
        [...project.name].some((character) => character.charCodeAt(0) < 32);
      const suggested = unsafeName ? path.parse(source.name).name : project.name;
      const chosen = await dialog.showSaveDialog(host.getWindow(), {
        defaultPath: host.savePath(`${suggested}.reupmatic.json`),
        filters: [{ name: 'Reupmatic project', extensions: ['json'] }],
      });
      if (chosen.canceled || !chosen.filePath) return null;
      filePath = chosen.filePath;
    } else {
      if (
        typeof value.path !== 'string' ||
        !value.path ||
        value.path.length > 4096 ||
        value.path.includes('\0')
      ) {
        throw new Error('INVALID_REQUEST');
      }
      filePath = value.path;
    }
    await saveProject(filePath, project, media.originalPaths);
    await recordRecent({
      kind: 'project',
      id: filePath,
      name: project.name,
      path: filePath,
      source_path: source.path,
      opened_at: Date.now(),
    });
    let linked = await host.library.recordLink(source, 'project', filePath);
    if (project.composition)
      linked =
        (await host.library.recordCompositionLinks(project.composition, 'project', filePath)) &&
        linked;
    if (project.soundtrack) {
      const audioLinked = await host.library.recordLink(
        source,
        'audio',
        project.soundtrack.source.path,
      );
      linked = linked && audioLinked;
    }
    return { saved: true, revision, library_linked: linked, path: filePath };
  });
  wire('open-project', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Reupmatic project', extensions: ['json'] }],
    });
    if (chosen.canceled) return null;
    const project = await loadProject(chosen.filePaths[0]);
    const video = await dialog.showOpenDialog(host.getWindow(), {
      title:
        host.getLanguage() === 'vi'
          ? 'Chọn video gốc của project'
          : 'Choose the project source video',
      defaultPath:
        path.isAbsolute(project.source.path) && !project.source.path.startsWith('\\\\')
          ? project.source.path
          : undefined,
      properties: ['openFile'],
      filters: videoFilters,
    });
    if (video.canceled) return null;
    const source = await media.registerVideo(video.filePaths[0]);
    const snapshot = await restoreProjectSnapshot(
      media,
      host.getWindow(),
      project,
      source,
      host.getLanguage(),
    );
    if (!snapshot) return null;
    await recordRecent({
      kind: 'project',
      id: chosen.filePaths[0],
      name: project.name,
      path: chosen.filePaths[0],
      source_path: source.path,
      opened_at: Date.now(),
    });
    return { media: media.publicVideo(source), snapshot, project_path: chosen.filePaths[0] };
  });
  // A Recent entry for a project reopens straight from its own stored path and the source
  // video's stored path — no dialog pair, unlike `open-project` above. Both files not being
  // where they were is a real, reportable failure (fail loudly), not a silent fallback to
  // showing pickers instead.
  wire('open-project-path', async (input) => {
    const project = await loadProject(input.path);
    const source = await media.registerVideo(project.source.path);
    const snapshot = await restoreProjectSnapshot(
      media,
      host.getWindow(),
      project,
      source,
      host.getLanguage(),
    );
    if (!snapshot) return null;
    await recordRecent({
      kind: 'project',
      id: input.path,
      name: project.name,
      path: input.path,
      source_path: source.path,
      opened_at: Date.now(),
    });
    return { media: media.publicVideo(source), snapshot, project_path: input.path };
  });
  wire('save-subtitles', async (input) => {
    const value = requestRecord(input, [
      'cues',
      'asset_id',
      'timing',
      'format',
      'style',
      'editing',
      'composition',
    ]);
    if (
      !['source', 'output'].includes(String(value.timing)) ||
      !['srt', 'ass'].includes(String(value.format))
    ) {
      throw new Error('INVALID_REQUEST');
    }
    assertCues(value.cues);
    const source = value.asset_id ? media.getVideo(value.asset_id) : undefined;
    if (value.format === 'ass' && !source) throw new Error('UNKNOWN_ASSET');
    const composition =
      value.composition === undefined ? undefined : parseComposition(value.composition);
    if (composition) media.authorizeComposition(composition);
    const style = value.style === undefined ? undefined : parseSubtitleStyle(value.style);
    const editing = value.editing === undefined ? undefined : parseEditing(value.editing);
    if (value.timing === 'source' && editing) throw new Error('INVALID_REQUEST');
    const name = `${value.timing === 'output' ? 'edited' : 'source'}-subtitles.${value.format}`;
    const chosen = await dialog.showSaveDialog(host.getWindow(), {
      defaultPath: host.savePath(name),
      filters: [
        { name: value.format === 'ass' ? 'ASS' : 'SubRip', extensions: [String(value.format)] },
      ],
    });
    if (chosen.canceled || !chosen.filePath) return null;
    const method = value.format === 'ass' ? 'subtitles.prepare' : 'subtitles.save';
    const params =
      value.format === 'ass'
        ? {
            cues: value.cues,
            asset_id: value.asset_id,
            ...(composition
              ? { canvas: { width: composition.canvas.width, height: composition.canvas.height } }
              : {}),
            ...(style ? { style } : {}),
            ...(editing ? { editing } : {}),
          }
        : { cues: value.cues, format: 'srt' };
    const generated = await worker.request(method, params).result;
    await saveChosenExport(generated.path, chosen.filePath, media.originalPaths);
    return {
      saved: true,
      library_linked: await host.library.recordLink(source, 'subtitle', chosen.filePath),
    };
  });
  wire('save-video', async (input) => {
    const artifactId = input.artifact_id;
    const artifactPath = media.resolve(artifactId);
    if (!artifactPath?.startsWith(path.join(host.workspace, 'renders') + path.sep)) {
      throw new Error('UNKNOWN_ASSET');
    }
    const chosen = await dialog.showSaveDialog(host.getWindow(), {
      defaultPath: host.savePath('processed.mp4'),
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    if (chosen.canceled || !chosen.filePath) return null;
    await saveChosenExport(artifactPath, chosen.filePath, media.originalPaths);
    let linked = await host.library.recordLink(
      media.artifactSource(artifactId),
      'export',
      chosen.filePath,
    );
    const composition = media.artifactComposition(artifactId);
    if (composition)
      linked =
        (await host.library.recordCompositionLinks(composition, 'export', chosen.filePath)) &&
        linked;
    return { saved: true, library_linked: linked };
  });
  return { recentList: () => recent.list() };
}
