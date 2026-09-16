import path from 'node:path';
import { type BrowserWindow, dialog } from 'electron';
import { parseComposition } from '../../../core/editing/composition/document.js';
import { parseEditing } from '../../../core/editing/edit-recipe.js';
import type { Soundtrack } from '../../../core/editing/soundtrack.js';
import { saveChosenExport } from '../../../core/media/files.js';
import { createProject, loadProject, saveProject } from '../../../core/projects/project.js';
import type { RenderCoordinator, RenderInput } from '../../../core/rendering/render-coordinator.js';
import { assertCues } from '../../../core/subtitles/cues.js';
import { parseSubtitleStyle } from '../../../core/subtitles/style.js';
import type { WorkerClient } from '../../../core/worker/worker-client.js';
import { type IpcWire, requestId, requestRecord, requestRevision } from '../../runtime/ipc.js';
import type { installLibrary } from '../library/ipc.js';
import { type MediaRegistry, videoFilters } from '../media/registry.js';
import { authorizeSnapshot, restoreProjectSnapshot } from '../projects/dependencies.js';
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
}

export function installEditor(host: Host): void {
  const { wire, worker, media } = host;
  installAudio(host);
  installComposition(host);
  wire('hello', () => worker.request('hello', {}).result);
  wire('open', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: videoFilters,
    });
    if (chosen.canceled) return null;
    return media.publicVideo(await media.registerVideo(chosen.filePaths[0]));
  });
  wire('import-subtitles', async () => {
    const chosen = await dialog.showOpenDialog(host.getWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'SubRip', extensions: ['srt'] }],
    });
    if (chosen.canceled) return null;
    const assetId = await media.registerSubtitle(chosen.filePaths[0]);
    return worker.request('subtitles.load', { asset_id: assetId }).result;
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
    ]);
    media.getVideo(value.asset_id);
    if (value.composition) media.authorizeComposition(parseComposition(value.composition));
    if (value.soundtrack) media.authorizeSoundtrack(value.soundtrack as Soundtrack);
    const ticket = host.renderer.start(value as unknown as RenderInput);
    return { request_id: ticket.id, revision: value.revision };
  });
  wire('cancel', (input) =>
    host.renderer.cancel(requestId(requestRecord(input, ['request_id']).request_id)),
  );
  wire('save-project', async (input) => {
    const value = requestRecord(input, ['asset_id', 'revision', 'snapshot']);
    const revision = requestRevision(value.revision);
    const source = media.getVideo(value.asset_id);
    const project = createProject({ path: source.path, sha256: source.sha256 }, value.snapshot);
    authorizeSnapshot(media, source, project);
    const chosen = await dialog.showSaveDialog(host.getWindow(), {
      defaultPath: host.savePath(`${path.parse(source.name).name}.reupmatic.json`),
      filters: [{ name: 'Reupmatic project', extensions: ['json'] }],
    });
    if (chosen.canceled || !chosen.filePath) return null;
    await saveProject(chosen.filePath, project, media.originalPaths);
    let linked = await host.library.recordLink(source, 'project', chosen.filePath);
    if (project.composition)
      linked =
        (await host.library.recordCompositionLinks(
          project.composition,
          'project',
          chosen.filePath,
        )) && linked;
    if (project.soundtrack) {
      const audioLinked = await host.library.recordLink(
        source,
        'audio',
        project.soundtrack.source.path,
      );
      linked = linked && audioLinked;
    }
    return { saved: true, revision, library_linked: linked };
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
    return snapshot ? { media: media.publicVideo(source), snapshot } : null;
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
    const generated = await worker.request<{ path: string }>(method, params).result;
    await saveChosenExport(generated.path, chosen.filePath, media.originalPaths);
    return {
      saved: true,
      library_linked: await host.library.recordLink(source, 'subtitle', chosen.filePath),
    };
  });
  wire('save-video', async (input) => {
    const artifactId = requestId(requestRecord(input, ['artifact_id']).artifact_id);
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
}
