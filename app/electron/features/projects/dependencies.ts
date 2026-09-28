import { type BrowserWindow, dialog } from 'electron';
import type { ClipSource, Composition } from '../../../core/editing/composition/document.js';
import { parseComposition } from '../../../core/editing/composition/document.js';
import type { RegisteredVideo } from '../../../core/media/media-contracts.js';
import { validateProjectTimeline } from '../../../core/projects/editor-timeline.js';
import {
  type EditorSnapshot,
  type ProjectFile,
  projectSnapshot,
} from '../../../core/projects/project.js';
import type { VoiceTrack } from '../../../core/speech/synthesis/voice-track.js';
import { restoreProjectAudio } from '../editor/audio/ipc.js';
import { type MediaRegistry, videoFilters } from '../media/registry.js';

async function restoreClips(
  media: MediaRegistry,
  window: BrowserWindow,
  document: Composition,
  anchor: RegisteredVideo,
  originalAnchor: ProjectFile['source'],
  language: string,
): Promise<Composition | null> {
  const composition = parseComposition(document);
  const granted = new Map<string, ClipSource>();
  for (const clip of composition.clips) {
    const key = JSON.stringify([clip.source.path, clip.source.sha256]);
    let source = granted.get(key);
    if (!source) {
      let video = anchor;
      if (
        clip.source.path !== originalAnchor.path ||
        clip.source.sha256 !== originalAnchor.sha256
      ) {
        const chosen = await dialog.showOpenDialog(window, {
          title:
            language === 'vi'
              ? `Chọn video cho đoạn: ${clip.source.name}`
              : `Choose source for clip: ${clip.source.name}`,
          defaultPath: clip.source.path.startsWith('\\\\') ? undefined : clip.source.path,
          properties: ['openFile'],
          filters: videoFilters,
        });
        if (chosen.canceled) return null;
        video = await media.registerVideo(chosen.filePaths[0]);
      }
      if (video.sha256 !== clip.source.sha256 || video.duration_ms !== clip.source.duration_ms)
        throw new Error('SOURCE_CHANGED');
      source = {
        path: video.path,
        name: video.name,
        sha256: video.sha256,
        duration_ms: video.duration_ms,
      };
      granted.set(key, source);
    }
    clip.source = source;
  }
  media.authorizeComposition(composition);
  return composition;
}

export function authorizeSnapshot(
  media: MediaRegistry,
  source: RegisteredVideo,
  snapshot: EditorSnapshot,
): void {
  validateProjectTimeline(snapshot, source.duration_ms);
  if (snapshot.soundtrack) media.authorizeSoundtrack(snapshot.soundtrack);
  if (snapshot.composition) media.authorizeComposition(snapshot.composition);
}

/** All dependency prompts finish before the renderer replaces its active document. */
export async function restoreProjectSnapshot(
  media: MediaRegistry,
  window: BrowserWindow,
  project: ProjectFile,
  source: RegisteredVideo,
  language = 'en',
  verifyVoice?: (track: VoiceTrack) => Promise<unknown>,
): Promise<EditorSnapshot | null> {
  if (source.sha256 !== project.source.sha256) throw new Error('SOURCE_CHANGED');
  const composition = project.composition
    ? await restoreClips(media, window, project.composition, source, project.source, language)
    : undefined;
  if (composition === null) return null;
  const soundtrack = await restoreProjectAudio(media, window, project.soundtrack, language);
  if (soundtrack === null) return null;
  const snapshot = projectSnapshot(project);
  if (composition) snapshot.composition = composition;
  else delete snapshot.composition;
  if (soundtrack) snapshot.soundtrack = soundtrack;
  else delete snapshot.soundtrack;
  authorizeSnapshot(media, source, snapshot);
  // The saved voice reference is rediscovered and re-verified; a stale, missing or
  // altered track aborts the open by name rather than dropping the field.
  if (snapshot.voice_track && verifyVoice) await verifyVoice(snapshot.voice_track);
  return snapshot;
}
