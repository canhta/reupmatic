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
import { useAutosave } from '../projects/recovery/useAutosave';
import type { SettingsCategory } from '../settings/SettingsPanel';
import { type SourceSelection, useSourcePreview } from './composition/useSourcePreview';
import { useEditorDocument } from './useEditorDocument';
import { type Preview, useRenderJob } from './useRenderJob';

type SaveResult = { saved: boolean; library_linked?: boolean; path?: string };

type Snapshot = EditorSnapshot;

/** The default project name for a first video: its file name without extension. */
function videoProjectName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').trim() || name;
}

const UNTITLED: Snapshot = { cues: [], sample: { start_ms: 0, end_ms: 10000 } };

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
  /** The one text layer shown on the subtitles lane and burned into the output, or null. */
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
  /** The open source video's own clip, shown on the clips lane even before any composition
   *  exists; null while no project is open. */
  primaryClip: CompositionClip | null;
  applyComposition: (
    commands: CompositionCommand[] | Composition,
    expectedRevision: number,
  ) => void;
  /** Places a Project media video on the timeline: `'end'` appends at the end, a number inserts
   *  at that index. The first placement turns the single-video document into a composition; the
   *  user never sees a "start composition" step (ticket 05, D-63). */
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
  /** Stored Project media rows only: added-but-unplaced videos and SRT files.
   *  The primary video, composition clips and soundtrack are derived (ED-P01). */
  projectMedia: ProjectMedia[];
  /** Ids of stored Project media whose file is no longer where it was saved. */
  mediaMissing: string[];
  importMedia: () => Promise<void>;
  /** Adds and selects a logo image through the one Import Media dialog (explicit use). */
  addLogoImage: () => Promise<void>;
  importSubtitleFile: (media: ProjectMedia) => Promise<void>;
  relinkMedia: (id: string) => Promise<void>;
  removeMedia: (id: string) => void;
  /** The `media://local/...` URL of the project image the logo placement names. */
  logoUrl: string | undefined;
  voiceTrack: VoiceTrack | undefined;
  changeVoiceTrack: (value: VoiceTrack | undefined) => void;
  acceptStaleVoiceTrack: () => void;
  processing: ProcessingRecipe | undefined;
  changeProcessing: (value: ProcessingRecipe | undefined) => void;
  dirty: boolean;
  clock: number;
  sampleStart: string;
  sampleEnd: string;
  savingProject: boolean;
  status: string;
  ass: SubtitlePreview | null;
  video: RefObject<HTMLVideoElement | null>;
  timeline: RefObject<TimelineState | null>;
  // Widened from HTMLHeadingElement: the header title is now the source
  // switcher's trigger, a plain focusable wrapper div, not a Heading.
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
  /** Starts an empty untitled project, confirming first when there are unsaved edits. */
  newProject: () => Promise<void>;
  /** In-place project rename: one undo step, marks unsaved, never writes a file. Empty is refused. */
  renameProject: (name: string) => boolean;
  /** The current project name (empty until named; the header shows its own placeholder). */
  projectName: string;
  /** The open project's own file; null until its first Save As. */
  projectPath: string | null;
  saveCurrentProject: () => Promise<void>;
  /** File > Save As: always picks a new destination and adopts it. */
  saveProjectAs: () => Promise<void>;
  saveSubtitles: (timing?: 'source' | 'output', format?: 'srt' | 'ass') => Promise<void>;
  saveVideo: (artifactId: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  render: (mode: 'sample' | 'full') => Promise<void> | undefined;
  /** A composition (clip assembly) doesn't support OCR/inpaint yet. */
  compositionBlocked: boolean;
  /** Shared eligibility for both Render sample (monitor) and Render full video (render band). */
  renderUnavailable: boolean;
  changeSampleStart: (value: string) => void;
  changeSampleEnd: (value: string) => void;
  /** Navigates to the Settings destination (D-57: a sidebar area now, not a second window),
   * optionally landing on one category; used by a generator's "Set up…" link when its local
   * model is missing. */
  openSettings: (tab?: SettingsCategory) => void;
}

export function useEditorSession(onOpenSettings: (tab?: SettingsCategory) => void): EditorSession {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const [documentId, setDocumentId] = useState(() => crypto.randomUUID());
  const [media, setMedia] = useState<PublicVideo | null>(null);
  // The open source video's own clip, resolved from the host: the clips lane
  // draws it from the moment a project opens, before any composition exists.
  const [primary, setPrimary] = useState<CompositionClip | null>(null);
  const [cap, setCap] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [activeTextLayer, setActiveTextLayer] = useState<TextLayerName>('displayed');
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [clock, setClock] = useState(0);
  const [savingProject, setSavingProject] = useState(false);
  // The open project's own file, if it has one; null until first Save As.
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
  const getRevision = useCallback(() => rev.current, []);
  const document = useEditorDocument(bump);
  const { history, snapshot } = document;
  const { cues, processing, soundtrack, voice_track } = snapshot;
  const voiceTrack = voice_track;
  const activeLayer = getTextLayer(snapshot, activeTextLayer);
  // The subtitles lane shows one burned layer at a time: the visible layer's cues are the ones
  // previewed and burned, and a cue over a disabled clip is clipped out of the output clock.
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
  const sampleStart = String(snapshot.sample.start_ms / 1000);
  const sampleEnd = String(snapshot.sample.end_ms / 1000);
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

  // The primary clip the clips lane always draws, resolved when the open source
  // changes. A closed project clears it; a failed read leaves the lane empty
  // rather than showing a stale file name.
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

  // The stored Project media files are the only dependency the open flow does
  // not already relink — the source video, composition clips and soundtrack are
  // re-registered while opening — so the section checks their paths whenever
  // they change and shows a relink row for any that moved.
  const mediaKey = JSON.stringify(snapshot.media ?? []);
  // The image the logo placement names, resolved from the stored Project media
  // rows; mediaKey covers every row's path and sha, so a relink re-reads the URL.
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
  // Registers the image and publishes its URL; shared with relinkMedia, whose
  // byte-identical mediaKey would otherwise leave the monitor on a stale URL.
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
    // Typing serializes subtitles only; it never starts a video render.
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

  // Adding a Project media video never places it (D-63); this is the one
  // placement path. A stored row is re-registered and its sha checked host-side.
  // The clips lane always shows the primary video as its first clip, so a
  // document with no composition is treated as the implicit one-clip
  // composition `[primary]` and the placement is the existing `insert` command:
  // the primary and its cues keep their clock whichever side the clip lands.
  async function placeMedia(item: ProjectMedia, at: number | 'end') {
    if (!media || !primary) return;
    const captured = rev.current;
    const count = composition?.clips.length ?? 1;
    if (count >= MAX_CLIPS) {
      // The limit is the existing composition constant; refuse here, before the
      // host round trip, so a full timeline is never sent to placement at all.
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

  // The audio twin of reviewLayerSource: a human reviewed the changed spoken text but keeps the
  // narration generated from the previous words. The core command owns the freshness refusal.
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
    // One place remembers the project's own file, so Save writes back to it;
    // a project opened from a video or a recovered draft has none yet.
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
    // The Editor's own workspace title heads the newly loaded document; a
    // start action, menu command or recovered-draft "Open" all replace the
    // whole start surface, so focus moves here instead of falling through to
    // <body> when the control that was clicked unmounts.
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
      if (dirty && !(await confirm(t('confirmOpen')))) return false;
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

  // A project created from a first video takes that video's own name (the
  // ticket's default), and the header can rename it in place afterwards.
  function initialSnapshot(value: PublicVideo): Snapshot {
    return {
      name: videoProjectName(value.name),
      cues: [],
      sample: { start_ms: 0, end_ms: Math.min(10000, value.duration_ms) },
    };
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
    // Dropping a file on an open project adds it as Project media; it never
    // replaces the document (ticket 12, D-63).
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

  // An empty untitled project. Starting one over unsaved edits goes through the
  // same confirmation as opening another project (ticket 12).
  async function newProject() {
    if (openingRef.current || renderingPublic.busy) return;
    if (dirty && !(await confirm(t('confirmNewProject')))) return;
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

  // Renaming is one document-history step (undoable) and marks the project
  // unsaved; it never touches a file on disk. An empty or oversized name is
  // refused rather than committed.
  function renameProject(next: string): boolean {
    const name = next.trim();
    if (!name || name.length > 200 || /[\r\n]/.test(name)) return false;
    if (document.getSnapshot().name === name) return true;
    document.change({ name });
    return true;
  }

  // Save writes back to the project's own file when it has one; `saveAs`
  // (File > Save As) always asks for a destination. Only a never-saved
  // project's first Save opens the picker (ticket 12).
  async function saveCurrentProject(saveAs = false) {
    if (!media || savingProject) return;
    const savedRevision = rev.current;
    try {
      setSavingProject(true);
      const start = Math.round(Number(sampleStart) * 1000);
      const end = Math.round(Number(sampleEnd) * 1000);
      if (
        !sampleStart.trim() ||
        !sampleEnd.trim() ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > duration
      ) {
        throw new Error('INVALID_PROJECT');
      }
      const value = await unwrap<SaveResult | null>(
        window.reupmatic.saveProject({
          asset_id: media.asset_id,
          revision: savedRevision,
          snapshot: { ...snapshot, sample: { start_ms: start, end_ms: end } },
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

  // File > Save As always picks a new destination and adopts it.
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

  // One history step applies the cues and records which layer the file went
  // into, so a Project media row's used marker tracks that import (ED-P01).
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

  // An audio file becomes the project's one soundtrack. Replacing an existing
  // track is confirmed first; the mix settings stay in the Audio panel.
  async function applyImportedAudio(source: AudioSource) {
    const existing = document.getSnapshot().soundtrack;
    if (existing && !(await confirm(t('mediaConfirmSoundtrack', { name: existing.source.name }))))
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

  // The SRT reaches a chosen text layer through the existing overwrite confirm
  // (ED-P01); a cancelled overwrite still keeps the file as a row to import
  // later, because adding media never has a side effect the user did not ask for.
  async function applyImportedSubtitle(item: ProjectMedia, cues: Cue[]) {
    const target = activeTextLayer;
    if (
      getTextLayer(document.getSnapshot(), target).cues.length &&
      !(await confirm(t('textConfirmImport', { layer: t(`textLayer_${target}`) })))
    ) {
      addMedia(item);
      return;
    }
    if (cues.some((cue) => cue.end_ms > duration)) throw new Error('INVALID_CUES');
    applySubtitle(item, cues, target);
  }

  // A stored subtitle row's own import path: the file is read back and the
  // same confirm applies. Used after a cancelled overwrite, or when a later
  // transcription replaced the layer the file was first imported into.
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

  // Adding never places media (D-63): a video or image joins the rows only.
  async function applyImported(value: ImportedMedia) {
    if (value.kind === 'video' || value.kind === 'image') addMedia(value.media);
    else if (value.kind === 'audio') await applyImportedAudio(value.source);
    else await applyImportedSubtitle(value.media, value.cues);
  }

  async function importMedia() {
    if (openingRef.current || renderingPublic.busy) throw new Error('EDITOR_BUSY');
    // With no project open, adding the first video creates one (Add…,
    // File > Import Media…, drop on the viewer); audio/SRT need a project.
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

  // The Logo section's own Add image…: the same dialog, filtered to images only
  // (the host refuses any other kind), added as a row and named by the placement.
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
      // The file can be relinked at the very path it already recorded, leaving
      // the snapshot byte-identical; clear the row's missing flag directly so
      // it does not depend on the media key changing.
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

  async function saveVideo(artifactId: string) {
    try {
      const value = await unwrap<SaveResult | null>(window.reupmatic.saveVideo(artifactId));
      if (value?.saved)
        setStatus(
          media?.library_id && value.library_linked === false ? 'savedWithoutLibraryLink' : 'saved',
        );
    } catch (reason) {
      report(reason);
    }
  }

  function render(mode: 'sample' | 'full') {
    if (openingRef.current) return;
    setError('');
    return renderingPublic.render(mode, {
      media,
      cues: renderCues,
      revision,
      sampleStart,
      sampleEnd,
      processing,
      soundtrack,
      voice: voiceTrack,
      composition,
      logo: logoMedia,
    });
  }

  // A composition (clip assembly) doesn't support OCR/inpaint yet; shared by
  // both render entry points (the monitor's Render sample and the render
  // band's Render full video/Export) so the two stay in sync.
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
    sampleStart,
    sampleEnd,
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
    undo: document.undo,
    redo: document.redo,
    render,
    compositionBlocked,
    renderUnavailable,
    changeSampleStart: (value: string) =>
      document.change({
        sample: { ...snapshot.sample, start_ms: Math.round(Number(value) * 1000) },
      }),
    changeSampleEnd: (value: string) =>
      document.change({ sample: { ...snapshot.sample, end_ms: Math.round(Number(value) * 1000) } }),
    openSettings: (tab?: SettingsCategory) => onOpenSettings(tab),
  };
}
