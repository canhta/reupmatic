import type { TimelineState } from '@xzdarcy/react-timeline-editor';
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  type CompositionCommand,
  editComposition,
} from '../../../core/editing/composition/commands';
import {
  type Composition,
  type CompositionClip,
  clipCuesToEnabled,
  compositionDuration,
  MAX_CLIPS,
  parseComposition,
} from '../../../core/editing/composition/document';
import {
  compositionSnapshot,
  editCompositionSnapshot,
} from '../../../core/editing/composition/snapshot';
import {
  DEFAULT_LOGO,
  type LogoPlacement,
  resolveEditWindow,
  retimeCues,
} from '../../../core/editing/edit-recipe';
import type { ProjectMedia } from '../../../core/editing/project-media';
import {
  type AudioSource,
  DEFAULT_SOUNDTRACK_DUCK,
  parseSoundtrack,
  type Soundtrack,
} from '../../../core/editing/soundtrack';
import type {
  CompositionPlacement,
  CompositionPrimary,
} from '../../../core/host-bridge/operations/composition';
import type { ImportedMedia } from '../../../core/host-bridge/operations/editor';
import type { PublicVideo } from '../../../core/media/media-contracts';
import type { ProcessingRecipe } from '../../../core/processing/recipe';
import { assertAdmitted, isCurrentRevision } from '../../../core/projects/editor-admission';
import type { EditorHistory } from '../../../core/projects/editor-history';
import type { EditorSnapshot } from '../../../core/projects/project';
import type { SpeechResult } from '../../../core/speech/recognition';
import type { VoiceTrack } from '../../../core/speech/synthesis/voice-track';
import {
  applyTranslation as applyTranslatedDraft,
  type TranslationPreview,
} from '../../../core/speech/translation/review';
import { assertCues, type Cue } from '../../../core/subtitles/cues';
import {
  acceptStaleVoiceTrack as acceptVoiceTrackStale,
  applyLayerCopy as applyTextCopy,
  editTextLayer,
  type LayerCopyPreview,
  reviewLayerSource as reviewTextCopy,
  setLayerVisibility,
} from '../../../core/subtitles/layers/commands';
import {
  getTextLayer,
  type LayerOrigin,
  type TextLanguage,
  type TextLayer,
  type TextLayerName,
  visibleTextLayer,
} from '../../../core/subtitles/layers/document';
import type { OcrResult } from '../../../core/vision/vision';
import { type Capabilities, unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { requestPost } from '../distribution/post-intent';
import { useAutosave } from '../projects/recovery/useAutosave';
import type { SettingsCategory } from '../settings/SettingsPanel';
import { type SourceSelection, useSourcePreview } from './composition/useSourcePreview';
import { useEditorDocument } from './useEditorDocument';
import { type Preview, useRenderJob } from './useRenderJob';

type SaveResult = {
  saved: boolean;
  library_linked?: boolean;
  path?: string;
  export_id?: string;
};

type Snapshot = EditorSnapshot;

function videoProjectName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').trim() || name;
}

const UNTITLED: Snapshot = { cues: [] };

export interface SubtitlePreview {
  revision: number;
  text: string;
}

export interface EditorSession {
  job: { id: string; phase: string } | null;
  busy: boolean;
  preview: Preview | null;
  seek: (milliseconds: number) => void;
  onSourceMetadata: () => void;
  onSourceTime: (milliseconds: number) => void;
  sourceSelection: SourceSelection | null;
  sourceUrl: string | undefined;
  sourceEmpty: boolean;
  activeTextLayer: TextLayerName;
  selectTextLayer: (name: TextLayerName) => void;
  visibleLayer: TextLayerName | null;
  changeLayerVisibility: (name: TextLayerName, visible: boolean) => void;
  activeLayer: TextLayer;
  changeLayerCues: (
    next: Cue[],
    name?: TextLayerName,
    options?: { language?: TextLanguage; origin?: LayerOrigin },
  ) => boolean;
  applyLayerCopy: (preview: LayerCopyPreview, expectedRevision: number) => void;
  reviewLayerSource: (preview: LayerCopyPreview, expectedRevision: number) => void;
  applyTranslation: (preview: TranslationPreview, expectedRevision: number) => void;
  applySpeech: (result: SpeechResult, expectedRevision: number, requestId: string) => boolean;
  applyOcr: (result: OcrResult, expectedRevision: number) => boolean;
  textSnapshot: EditorSnapshot;
  documentId: string;
  autosave: ReturnType<typeof useAutosave>;
  openRecovery: (id: string, expected_revision: number) => Promise<void>;
  media: PublicVideo | null;
  duration: number;
  composition: Composition | undefined;
  primaryClip: CompositionClip | null;
  applyComposition: (
    commands: CompositionCommand[] | Composition,
    expectedRevision: number,
  ) => void;
  placeMedia: (item: ProjectMedia, at: number | 'end') => Promise<void>;
  cap: Capabilities | null;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  history: EditorHistory;
  cues: Cue[];
  selected: string;
  setSelected: Dispatch<SetStateAction<string>>;
  revision: number;
  getRevision: () => number;
  soundtrack: Soundtrack | undefined;
  changeSoundtrack: (value: Soundtrack | undefined) => void;
  projectMedia: ProjectMedia[];
  mediaMissing: string[];
  importMedia: () => Promise<void>;
  addLogoImage: () => Promise<void>;
  importSubtitleFile: (media: ProjectMedia) => Promise<void>;
  relinkMedia: (id: string) => Promise<void>;
  removeMedia: (id: string) => void;
  logoUrl: string | undefined;
  voiceTrack: VoiceTrack | undefined;
  changeVoiceTrack: (value: VoiceTrack | undefined) => void;
  acceptStaleVoiceTrack: () => void;
  processing: ProcessingRecipe | undefined;
  changeProcessing: (value: ProcessingRecipe | undefined) => void;
  dirty: boolean;
  clock: number;
  savingProject: boolean;
  status: string;
  ass: SubtitlePreview | null;
  video: RefObject<HTMLVideoElement | null>;
  timeline: RefObject<TimelineState | null>;
  titleRef: RefObject<HTMLElement | null>;
  opening: boolean;
  report: (reason: unknown) => void;
  change: (next: Cue[]) => void;
  updateClock: (milliseconds: number) => void;
  open: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  openLibrary: (id: string, projectId?: string) => Promise<boolean>;
  openProject: () => Promise<void>;
  openProjectPath: (path: string) => Promise<void>;
  newProject: () => Promise<void>;
  renameProject: (name: string) => boolean;
  projectName: string;
  projectPath: string | null;
  saveCurrentProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  saveSubtitles: (timing?: 'source' | 'output', format?: 'srt' | 'ass') => Promise<void>;
  saveVideo: (artifactId: string) => Promise<SaveResult | null | undefined>;
  postExport: (artifactId: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  render: () => Promise<void> | undefined;
  compositionBlocked: boolean;
  renderUnavailable: boolean;
  openSettings: (tab?: SettingsCategory) => void;
}

export function useEditorSession(onOpenSettings: (tab?: SettingsCategory) => void): EditorSession {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const [documentId, setDocumentId] = useState(() => crypto.randomUUID());
  const [media, setMedia] = useState<PublicVideo | null>(null);
  const [primary, setPrimary] = useState<CompositionClip | null>(null);
  const [cap, setCap] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [activeTextLayer, setActiveTextLayer] = useState<TextLayerName>('displayed');
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [clock, setClock] = useState(0);
  const [savingProject, setSavingProject] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [status, setStatus] = useState('ready');
  const [mediaMissing, setMediaMissing] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [ass, setAss] = useState<SubtitlePreview | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const timeline = useRef<TimelineState>(null);
  const titleRef = useRef<HTMLElement>(null);
  const rev = useRef(0);
  // Render artifact id -> Library export link id, filled when an export is saved.
  const exportLinks = useRef(new Map<string, string>());
  const getRevision = useCallback(() => rev.current, []);
  const document = useEditorDocument(bump);
  const { history, snapshot } = document;
  const { cues, processing, soundtrack, voice_track } = snapshot;
  const voiceTrack = voice_track;
  const activeLayer = getTextLayer(snapshot, activeTextLayer);
  const visibleLayer = useMemo(() => visibleTextLayer(snapshot), [snapshot]);
  const burnCues = useMemo(
    () => (visibleLayer ? getTextLayer(snapshot, visibleLayer).cues : []),
    [snapshot, visibleLayer],
  );
  const compositionKey = JSON.stringify(snapshot.composition);
  const composition = useMemo(
    () => (compositionKey ? parseComposition(JSON.parse(compositionKey)) : undefined),
    [compositionKey],
  );
  const renderCues = useMemo(
    () => (composition ? clipCuesToEnabled(composition, burnCues) : burnCues),
    [composition, burnCues],
  );
  const duration = composition ? compositionDuration(composition) : (media?.duration_ms ?? 0);
  const report = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
  }, []);
  const { setPreview, ...renderingPublic } = useRenderJob(rev, report, setStatus);
  const autosave = useAutosave({ documentId, media, snapshot, revision, dirty, opening });

  const updateClock = useCallback((milliseconds: number) => {
    setClock(milliseconds);
    timeline.current?.setTime(milliseconds / 1000);
  }, []);
  const sourcePreview = useSourcePreview(
    documentId,
    media,
    composition,
    video,
    updateClock,
    report,
  );

  useEffect(() => {
    void unwrap<Capabilities>(window.reupmatic.hello()).then(setCap).catch(report);
  }, [report]);

  const assetId = media?.asset_id;
  useEffect(() => {
    if (!assetId) {
      setPrimary(null);
      return;
    }
    let alive = true;
    void unwrap<CompositionPrimary>(window.reupmatic.compositionPrimary(assetId))
      .then((value) => {
        if (alive) setPrimary(value.clip);
      })
      .catch(() => {
        if (alive) setPrimary(null);
      });
    return () => {
      alive = false;
    };
  }, [assetId]);

  const mediaKey = JSON.stringify(snapshot.media ?? []);
  const logoMediaId = processing?.editing?.logo?.media_id;
  const logoMedia = useMemo(
    () =>
      logoMediaId
        ? (JSON.parse(mediaKey) as ProjectMedia[]).find(
            (item) => item.id === logoMediaId && item.kind === 'image',
          )
        : undefined,
    [logoMediaId, mediaKey],
  );
  // mediaKey covers every path and sha, so a relink re-reads the URL.
  async function publishLogoUrl(item: ProjectMedia) {
    try {
      setLogoUrl((await unwrap<{ url: string }>(window.reupmatic.mediaUrl({ media: item }))).url);
    } catch {
      setLogoUrl(undefined);
    }
  }
  useEffect(() => {
    if (!logoMedia) {
      setLogoUrl(undefined);
      return;
    }
    let alive = true;
    void unwrap<{ url: string }>(window.reupmatic.mediaUrl({ media: logoMedia }))
      .then((value) => {
        if (alive) setLogoUrl(value.url);
      })
      .catch(() => {
        if (alive) setLogoUrl(undefined);
      });
    return () => {
      alive = false;
    };
  }, [logoMedia]);
  useEffect(() => {
    const items: ProjectMedia[] = JSON.parse(mediaKey);
    if (!items.length) {
      setMediaMissing([]);
      return;
    }
    let alive = true;
    void unwrap<{ missing: string[] }>(window.reupmatic.mediaCheck({ items }))
      .then((value) => {
        if (alive) setMediaMissing(value.missing);
      })
      .catch(() => {
        if (alive) setMediaMissing([]);
      });
    return () => {
      alive = false;
    };
  }, [mediaKey]);

  useEffect(() => {
    if (!media || composition || !cap?.pysubs2) {
      setAss(null);
      return;
    }
    let alive = true;
    const snapshot = revision;
    const timer = setTimeout(() => {
      void unwrap<{ ass_text: string }>(
        window.reupmatic.ass({
          cues: renderCues,
          revision: snapshot,
          asset_id: media.asset_id,
          ...(processing?.subtitle_style ? { style: processing.subtitle_style } : {}),
        }),
      )
        .then((data) => {
          if (alive && snapshot === rev.current)
            setAss({ revision: snapshot, text: data.ass_text });
        })
        .catch((reason) => {
          if (alive) report(reason);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [renderCues, media, composition, cap?.pysubs2, revision, processing?.subtitle_style, report]);

  function bump() {
    rev.current += 1;
    setRevision(rev.current);
    setDirty(true);
    setError('');
  }

  function change(next: Cue[]) {
    try {
      assertCues(next);
      if (composition && next.some((cue) => cue.end_ms > duration)) throw new Error('INVALID_CUES');
      document.change({ cues: next });
    } catch {
      setError('INVALID_CUES');
    }
  }

  function applyComposition(
    commands: CompositionCommand[] | Composition,
    expectedRevision: number,
  ) {
    assertAdmitted(rev.current, expectedRevision, renderingPublic.busy || openingRef.current);
    const current = document.getSnapshot();
    document.change(
      Array.isArray(commands)
        ? editCompositionSnapshot(current, commands)
        : compositionSnapshot(current, commands, current.cues),
    );
  }

  async function placeMedia(item: ProjectMedia, at: number | 'end') {
    if (!media || !primary) return;
    const captured = rev.current;
    const count = composition?.clips.length ?? 1;
    if (count >= MAX_CLIPS) {
      // Refuse at the composition limit before the host round trip.
      setError('COMPOSITION_CLIP_LIMIT');
      return;
    }
    const index = at === 'end' ? count : Math.max(0, Math.min(at, count));
    try {
      const value = await unwrap<CompositionPlacement>(
        window.reupmatic.compositionPlace({ asset_id: media.asset_id, media: item }),
      );
      if (captured !== rev.current) throw new Error('STALE_OPERATION');
      assertAdmitted(rev.current, captured, renderingPublic.busy || openingRef.current);
      const current = document.getSnapshot();
      const before: Composition = composition ?? { canvas: value.canvas, clips: [primary] };
      const edited = editComposition(before, current.cues, {
        kind: 'insert',
        index,
        clip: value.placed,
      });
      document.change(compositionSnapshot(current, edited.composition, edited.cues));
    } catch (reason) {
      report(reason);
    }
  }

  function changeLayerCues(
    next: Cue[],
    name = activeTextLayer,
    options: { language?: TextLanguage; origin?: LayerOrigin } = {},
  ) {
    try {
      assertCues(next);
      if (next.some((cue) => cue.end_ms > duration)) throw new Error('INVALID_CUES');
      document.change(editTextLayer(document.getSnapshot(), name, next, options));
      return true;
    } catch (reason) {
      report(reason);
      return false;
    }
  }

  function selectTextLayer(name: TextLayerName) {
    setActiveTextLayer(name);
    setSelected(getTextLayer(document.getSnapshot(), name).cues[0]?.id ?? '');
  }

  function changeLayerVisibility(name: TextLayerName, visible: boolean) {
    document.change(setLayerVisibility(document.getSnapshot(), name, visible));
  }

  function applyLayerCopy(preview: LayerCopyPreview, expectedRevision: number) {
    assertAdmitted(rev.current, expectedRevision, openingRef.current);
    const next = applyTextCopy(document.getSnapshot(), preview);
    if (getTextLayer(next, preview.to).cues.some((cue) => cue.end_ms > duration))
      throw new Error('INVALID_CUES');
    document.change(next);
  }

  function reviewLayerSource(preview: LayerCopyPreview, expectedRevision: number) {
    assertAdmitted(rev.current, expectedRevision, openingRef.current);
    document.change(reviewTextCopy(document.getSnapshot(), preview));
  }

  function acceptStaleVoiceTrack() {
    document.change(acceptVoiceTrackStale(document.getSnapshot()));
  }

  function applyTranslation(preview: TranslationPreview, expectedRevision: number) {
    assertAdmitted(rev.current, expectedRevision, openingRef.current);
    const next = applyTranslatedDraft(document.getSnapshot(), preview);
    if (getTextLayer(next, 'translated').cues.some((cue) => cue.end_ms > duration))
      throw new Error('INVALID_CUES');
    document.change(next);
  }

  function applySpeech(result: SpeechResult, expectedRevision: number, requestId: string) {
    if (result.asset_id !== media?.asset_id || composition) throw new Error('STALE_OPERATION');
    assertAdmitted(rev.current, expectedRevision, openingRef.current);
    return changeLayerCues(result.cues, 'transcript', {
      language: result.language,
      origin: {
        kind: 'stt',
        request_id: requestId,
        source_sha256: result.source_sha256,
        start_ms: result.start_ms,
        end_ms: result.end_ms,
        model_id: result.model_id,
        runtime: result.runtime,
      },
    });
  }

  function applyOcr(result: OcrResult, expectedRevision: number) {
    if (
      expectedRevision !== rev.current ||
      result.asset_id !== media?.asset_id ||
      composition ||
      openingRef.current
    )
      return false;
    return changeLayerCues(result.cues, 'displayed', {
      language: result.language,
      origin: {
        kind: 'ocr',
        request_id: result.analysis_id,
        source_sha256: result.source_sha256,
        start_ms: result.start_ms,
        end_ms: result.end_ms,
      },
    });
  }

  function restore(nextMedia: PublicVideo, snapshot: Snapshot, filePath: string | null = null) {
    setDocumentId(crypto.randomUUID());
    setActiveTextLayer('displayed');
    setMedia(nextMedia);
    setProjectPath(filePath);
    document.restore(snapshot);
    setSelected(snapshot.cues[0]?.id || '');
    setPreview(null);
    setAss(null);
    setClock(0);
    rev.current += 1;
    setRevision(rev.current);
    setDirty(false);
    setError('');
    setStatus('ready');
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  async function loadSource(
    load: () => Promise<{ media: PublicVideo; snapshot: Snapshot; project_path?: string } | null>,
  ) {
    if (openingRef.current || renderingPublic.busy) throw new Error('EDITOR_BUSY');
    openingRef.current = true;
    setOpening(true);
    const captured = rev.current;
    try {
      if (
        dirty &&
        !(await confirm(t('confirmOpen'), {
          title: t('confirmDiscardTitle'),
          confirmLabel: t('confirmDiscardAction'),
          destructive: true,
        }))
      )
        return false;
      const value = await load();
      if (!value) return false;
      if (captured !== rev.current) throw new Error('STALE_OPERATION');
      await autosave.flush();
      if (captured !== rev.current) throw new Error('STALE_OPERATION');
      restore(value.media, value.snapshot, value.project_path ?? null);
      return true;
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }

  function initialSnapshot(value: PublicVideo): Snapshot {
    return { name: videoProjectName(value.name), cues: [] };
  }

  async function open() {
    try {
      await loadSource(async () => {
        const value = await unwrap<PublicVideo | null>(window.reupmatic.open());
        return value ? { media: value, snapshot: initialSnapshot(value) } : null;
      });
    } catch (reason) {
      report(reason);
    }
  }

  async function openPath(path: string) {
    if (media) {
      await addVideoPath(path);
      return;
    }
    try {
      await loadSource(async () => {
        const value = await unwrap<PublicVideo | null>(window.reupmatic.openVideoPath(path));
        return value ? { media: value, snapshot: initialSnapshot(value) } : null;
      });
    } catch (reason) {
      report(reason);
    }
  }

  async function addVideoPath(path: string) {
    try {
      addMedia(await unwrap<ProjectMedia>(window.reupmatic.mediaAddPath(path)));
    } catch (reason) {
      report(reason);
    }
  }

  async function openLibrary(id: string, projectId?: string) {
    if (projectId)
      return loadSource(() => unwrap(window.reupmatic.libraryOpenProject(id, projectId)));
    if (media) {
      try {
        addMedia(await unwrap<ProjectMedia>(window.reupmatic.libraryAddMedia(id)));
        return true;
      } catch (reason) {
        report(reason);
        return false;
      }
    }
    return loadSource(async () => {
      const value = await unwrap(window.reupmatic.libraryOpen(id));
      return { media: value, snapshot: initialSnapshot(value) };
    });
  }

  async function openProject() {
    try {
      await loadSource(() => unwrap(window.reupmatic.openProject()));
    } catch (reason) {
      report(reason);
    }
  }

  async function openProjectPath(path: string) {
    try {
      await loadSource(() => unwrap(window.reupmatic.openProjectPath(path)));
    } catch (reason) {
      report(reason);
    }
  }

  async function openRecovery(id: string, expected_revision: number) {
    try {
      if (await loadSource(() => unwrap(window.reupmatic.recoveryOpen({ id, expected_revision }))))
        setDirty(true);
    } catch (reason) {
      report(reason);
    }
  }

  async function newProject() {
    if (openingRef.current || renderingPublic.busy) return;
    if (
      dirty &&
      !(await confirm(t('confirmNewProject'), {
        title: t('confirmDiscardTitle'),
        confirmLabel: t('confirmDiscardAction'),
        destructive: true,
      }))
    )
      return;
    setDocumentId(crypto.randomUUID());
    setActiveTextLayer('displayed');
    setMedia(null);
    setProjectPath(null);
    document.restore(UNTITLED);
    setSelected('');
    setPreview(null);
    setAss(null);
    setClock(0);
    rev.current += 1;
    setRevision(rev.current);
    setDirty(false);
    setError('');
    setStatus('ready');
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function renameProject(next: string): boolean {
    const name = next.trim();
    if (!name || name.length > 200 || /[\r\n]/.test(name)) return false;
    if (document.getSnapshot().name === name) return true;
    document.change({ name });
    return true;
  }

  async function saveCurrentProject(saveAs = false) {
    if (!media || savingProject) return;
    const savedRevision = rev.current;
    try {
      setSavingProject(true);
      const value = await unwrap<SaveResult | null>(
        window.reupmatic.saveProject({
          asset_id: media.asset_id,
          revision: savedRevision,
          snapshot,
          ...(saveAs || !projectPath ? {} : { path: projectPath }),
        }),
      );
      if (value?.saved) {
        if (value.path) setProjectPath(value.path);
        setStatus(
          media?.library_id && value.library_linked === false ? 'savedWithoutLibraryLink' : 'saved',
        );
        if (isCurrentRevision(rev.current, savedRevision)) {
          setDirty(false);
          await autosave.clearSaved(savedRevision);
        }
      }
    } catch (reason) {
      report(reason);
    } finally {
      setSavingProject(false);
    }
  }

  function saveProjectAs() {
    return saveCurrentProject(true);
  }

  function storedMedia(): ProjectMedia[] {
    return document.getSnapshot().media ?? [];
  }

  function withMedia(item: ProjectMedia): ProjectMedia[] {
    const items = storedMedia();
    return items.some((entry) => entry.id === item.id)
      ? items.map((entry) => (entry.id === item.id ? item : entry))
      : [...items, item];
  }

  function addMedia(item: ProjectMedia) {
    document.change({ media: withMedia(item) });
  }

  function removeMedia(id: string) {
    const items = storedMedia();
    if (!items.some((item) => item.id === id)) return;
    document.change({ media: items.filter((item) => item.id !== id) });
  }

  function applySubtitle(item: ProjectMedia, cues: Cue[], target: TextLayerName) {
    const base = {
      ...document.getSnapshot(),
      media: withMedia({ ...item, imported_layer: target }),
    };
    const next = editTextLayer(base, target, cues, { origin: { kind: 'srt' } });
    document.change(next);
    setActiveTextLayer(target);
    setSelected(cues[0]?.id || '');
  }

  async function applyImportedAudio(source: AudioSource) {
    const existing = document.getSnapshot().soundtrack;
    if (
      existing &&
      !(await confirm(t('mediaConfirmSoundtrack', { name: existing.source.name }), {
        title: t('confirmReplaceTitle'),
        confirmLabel: t('confirmReplaceAction'),
      }))
    )
      return;
    document.change({
      soundtrack: parseSoundtrack({
        source,
        mode: existing?.mode ?? 'replace',
        start_ms: 0,
        end_ms: source.duration_ms,
        offset_ms: 0,
        gain_db: 0,
        fade_in_ms: 0,
        fade_out_ms: 0,
        duck: existing?.duck ?? DEFAULT_SOUNDTRACK_DUCK,
        muted: existing?.muted ?? false,
      }),
    });
  }

  async function applyImportedSubtitle(item: ProjectMedia, cues: Cue[]) {
    const target = activeTextLayer;
    if (
      getTextLayer(document.getSnapshot(), target).cues.length &&
      !(await confirm(t('textConfirmImport', { layer: t(`textLayer_${target}`) }), {
        title: t('confirmReplaceTitle'),
        confirmLabel: t('confirmReplaceAction'),
      }))
    ) {
      addMedia(item);
      return;
    }
    if (cues.some((cue) => cue.end_ms > duration)) throw new Error('INVALID_CUES');
    applySubtitle(item, cues, target);
  }

  async function importSubtitleFile(item: ProjectMedia) {
    const captured = rev.current;
    try {
      const value = await unwrap<{ cues: Cue[] } | null>(
        window.reupmatic.mediaLoad({ media: item }),
      );
      if (!value) return;
      if (captured !== rev.current) throw new Error('STALE_OPERATION');
      await applyImportedSubtitle(item, value.cues);
    } catch (reason) {
      report(reason);
    }
  }

  async function applyImported(value: ImportedMedia) {
    if (value.kind === 'video' || value.kind === 'image') addMedia(value.media);
    else if (value.kind === 'audio') await applyImportedAudio(value.source);
    else await applyImportedSubtitle(value.media, value.cues);
  }

  async function importMedia() {
    if (openingRef.current || renderingPublic.busy) throw new Error('EDITOR_BUSY');
    if (!media) {
      await open();
      return;
    }
    const captured = rev.current;
    try {
      const value = await unwrap<ImportedMedia | null>(window.reupmatic.importMedia());
      if (!value) return;
      if (captured !== rev.current) throw new Error('STALE_OPERATION');
      await applyImported(value);
    } catch (reason) {
      report(reason);
    }
  }

  async function addLogoImage() {
    if (openingRef.current || renderingPublic.busy) throw new Error('EDITOR_BUSY');
    const captured = rev.current;
    try {
      const value = await unwrap<ImportedMedia | null>(window.reupmatic.importMedia('image'));
      if (value?.kind !== 'image') return;
      if (captured !== rev.current) throw new Error('STALE_OPERATION');
      const current = document.getSnapshot();
      const editing = current.processing?.editing ?? {};
      const logo: LogoPlacement = {
        ...(editing.logo ?? DEFAULT_LOGO),
        media_id: value.media.id,
      };
      document.change({
        media: withMedia(value.media),
        processing: { ...current.processing, editing: { ...editing, logo } },
      });
    } catch (reason) {
      report(reason);
    }
  }

  async function relinkMedia(id: string) {
    const item = storedMedia().find((entry) => entry.id === id);
    if (!item) return;
    const captured = rev.current;
    try {
      const value = await unwrap<{ media: ProjectMedia } | null>(
        window.reupmatic.mediaRelink({ media: item }),
      );
      if (!value) return;
      if (captured !== rev.current) throw new Error('STALE_OPERATION');
      document.change({
        media: storedMedia().map((entry) => (entry.id === id ? value.media : entry)),
      });
      // Relinking at the recorded path is byte-identical; clear the missing flag directly.
      setMediaMissing((missing) => missing.filter((entry) => entry !== id));
      if (value.media.kind === 'image' && value.media.id === logoMediaId)
        await publishLogoUrl(value.media);
    } catch (reason) {
      report(reason);
    }
  }

  async function saveSubtitles(
    timing: 'source' | 'output' = 'source',
    format: 'srt' | 'ass' = 'srt',
  ) {
    try {
      const currentCues = getTextLayer(document.getSnapshot(), activeTextLayer).cues;
      const outputCues =
        timing === 'output' && media
          ? retimeCues(currentCues, resolveEditWindow(processing?.editing, duration))
          : currentCues;
      const value = await unwrap<SaveResult | null>(
        window.reupmatic.saveSubtitles({
          cues: outputCues,
          timing,
          format,
          ...(composition ? { composition } : {}),
          ...(format === 'ass' && activeTextLayer === 'displayed' && processing?.subtitle_style
            ? { style: processing.subtitle_style }
            : {}),
          ...(timing === 'output' && processing?.editing ? { editing: processing.editing } : {}),
          ...(media ? { asset_id: media.asset_id } : {}),
        }),
      );
      if (value?.saved)
        setStatus(
          media?.library_id && value.library_linked === false ? 'savedWithoutLibraryLink' : 'saved',
        );
    } catch (reason) {
      report(reason);
    }
  }

  async function saveVideo(artifactId: string): Promise<SaveResult | null | undefined> {
    try {
      const value = await unwrap<SaveResult | null>(window.reupmatic.saveVideo(artifactId));
      if (value?.saved) {
        if (value.export_id) exportLinks.current.set(artifactId, value.export_id);
        setStatus(
          media?.library_id && value.library_linked === false ? 'savedWithoutLibraryLink' : 'saved',
        );
      }
      return value;
    } catch (reason) {
      report(reason);
      return undefined;
    }
  }

  // Post needs the Library export link id, not the render artifact id. A result that
  // was never saved runs the same save flow first.
  async function postExport(artifactId: string) {
    const saved = exportLinks.current.get(artifactId);
    if (saved) {
      requestPost(saved);
      return;
    }
    const value = await saveVideo(artifactId);
    if (value?.export_id) requestPost(value.export_id);
    else if (value?.saved) setError('POST_REQUIRES_LIBRARY');
  }

  function render() {
    if (openingRef.current) return;
    setError('');
    return renderingPublic.render({
      media,
      cues: renderCues,
      revision,
      processing,
      soundtrack,
      voice: voiceTrack,
      composition,
      logo: logoMedia,
    });
  }

  const compositionBlocked = Boolean(composition && (processing?.ocr || processing?.inpaint));
  const renderUnavailable =
    compositionBlocked ||
    renderingPublic.busy ||
    opening ||
    !cap?.ffmpeg ||
    ((renderCues.length > 0 || processing?.ocr) && !cap?.pysubs2) ||
    Boolean(renderCues.length && processing?.ocr);

  return {
    activeTextLayer,
    selectTextLayer,
    visibleLayer,
    changeLayerVisibility,
    activeLayer,
    changeLayerCues,
    applyLayerCopy,
    reviewLayerSource,
    applyTranslation,
    applySpeech,
    applyOcr,
    textSnapshot: snapshot,
    documentId,
    autosave,
    openRecovery,
    media,
    duration,
    composition,
    primaryClip: primary,
    applyComposition,
    placeMedia,
    cap,
    error,
    setError,
    history,
    cues,
    selected,
    setSelected,
    revision,
    getRevision,
    soundtrack,
    changeSoundtrack: (value: Soundtrack | undefined) => document.change({ soundtrack: value }),
    projectMedia: snapshot.media ?? [],
    logoUrl,
    mediaMissing,
    importMedia,
    addLogoImage,
    importSubtitleFile,
    relinkMedia,
    removeMedia,
    voiceTrack,
    changeVoiceTrack: (value: VoiceTrack | undefined) =>
      document.change({ voice_track: value ?? undefined }),
    acceptStaleVoiceTrack,
    processing,
    changeProcessing: (value: ProcessingRecipe | undefined) =>
      document.change({ processing: value }),
    dirty,
    clock,
    savingProject,
    status,
    ass,
    video,
    timeline,
    titleRef,
    ...renderingPublic,
    ...sourcePreview,
    opening,
    report,
    change,
    updateClock,
    open,
    openPath,
    openLibrary,
    openProject,
    openProjectPath,
    newProject,
    renameProject,
    projectName: snapshot.name ?? '',
    projectPath,
    saveCurrentProject,
    saveProjectAs,
    saveSubtitles,
    saveVideo,
    postExport,
    undo: document.undo,
    redo: document.redo,
    render,
    compositionBlocked,
    renderUnavailable,
    openSettings: (tab?: SettingsCategory) => onOpenSettings(tab),
  };
}
