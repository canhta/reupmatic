import { applyTranslation as applyTranslatedDraft, type TranslationPreview } from '../../../core/speech/translation/review';
import { editTextLayer, applyLayerCopy as applyTextCopy, reviewLayerSource as reviewTextCopy, type LayerCopyPreview } from '../../../core/subtitles/layers/commands';
import { getTextLayer, type TextLayerName, type TextLanguage, type LayerOrigin } from '../../../core/subtitles/layers/document';
import type { SpeechResult } from '../../../core/speech/recognition';
import type { OcrResult } from '../../../core/vision/vision';
import { compositionSnapshot, editCompositionSnapshot } from '../../../core/editing/composition/snapshot';
import type { CompositionCommand } from '../../../core/editing/composition/commands';
import { compositionDuration, parseComposition, type Composition } from '../../../core/editing/composition/document';
import { useSourcePreview } from './composition/useSourcePreview';
import type { Soundtrack } from '../../../core/editing/soundtrack';
import { useAutosave } from '../projects/recovery/useAutosave';
import { resolveEditWindow, retimeCues } from '../../../core/editing/edit-recipe';
import { useEditorDocument } from './useEditorDocument';
import type { ProcessingRecipe } from '../../../core/processing/recipe';
import type { EditorSnapshot } from '../../../core/projects/project';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineState } from '@xzdarcy/react-timeline-editor';
import { useTranslation } from 'react-i18next';
import { assertCues, type Cue } from '../../../core/subtitles/cues';
import { unwrap } from '../../bridge/client';
import type { Capabilities, Media, SubtitlePreview } from './types';
import { useRenderJob } from './useRenderJob';

type SaveResult = { saved: boolean; library_linked?: boolean };

type Snapshot = EditorSnapshot;

export function useEditorModel() {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const [documentId, setDocumentId] = useState(() => crypto.randomUUID());
  const [media, setMedia] = useState<Media | null>(null);
  const [cap, setCap] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [activeTextLayer, setActiveTextLayer] = useState<TextLayerName>('displayed');
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [clock, setClock] = useState(0);
  const [savingProject, setSavingProject] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const [status, setStatus] = useState('ready');
  const [ass, setAss] = useState<SubtitlePreview | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const timeline = useRef<TimelineState>(null);
  const rev = useRef(0);
  const document = useEditorDocument(bump);
  const { history, snapshot } = document;
  const { cues, processing, soundtrack } = snapshot;
  const activeLayer = getTextLayer(snapshot, activeTextLayer);
  const compositionKey = JSON.stringify(snapshot.composition);
  const composition = useMemo(() => compositionKey ? parseComposition(JSON.parse(compositionKey)) : undefined, [compositionKey]);
  const duration = composition ? compositionDuration(composition) : media?.duration_ms ?? 0;
  const sampleStart = String(snapshot.sample.start_ms / 1000);
  const sampleEnd = String(snapshot.sample.end_ms / 1000);
  const report = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
  }, []);
  const rendering = useRenderJob(rev, report, setStatus);
  const autosave = useAutosave({ documentId, media, snapshot, revision, dirty, opening });

  const updateClock = useCallback((milliseconds: number) => {
    setClock(milliseconds);
    timeline.current?.setTime(milliseconds / 1000);
  }, []);
  const sourcePreview = useSourcePreview(documentId, media, composition, video, updateClock, report);

  useEffect(() => {
    void unwrap<Capabilities>(window.reupmatic.hello()).then(setCap).catch(report);
  }, [report]);

  useEffect(() => {
    if (!media || composition || !cap?.pysubs2) {
      setAss(null);
      return;
    }
    let alive = true;
    const snapshot = revision;
    // Typing serializes subtitles only; it never starts a video render.
    const timer = setTimeout(() => {
      void unwrap<{ ass_text: string }>(window.reupmatic.ass({ cues, revision: snapshot, asset_id: media.asset_id,
        ...(processing?.subtitle_style ? { style: processing.subtitle_style } : {}) }))
        .then(data => {
          if (alive && snapshot === rev.current) setAss({ revision: snapshot, text: data.ass_text });
        }).catch(reason => { if (alive) report(reason); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [cues, media, composition, cap?.pysubs2, revision, processing?.subtitle_style, report]);

  function bump() {
    rev.current += 1;
    setRevision(rev.current);
    setDirty(true);
    setError('');
  }

  function change(next: Cue[]) {
    try {
      assertCues(next);
      if (composition && next.some(cue => cue.end_ms > duration)) throw new Error('INVALID_CUES');
      document.change({ cues: next });
    } catch { setError('INVALID_CUES'); }
  }

  function applyComposition(commands: CompositionCommand[] | Composition, expectedRevision: number) {
    if (expectedRevision !== rev.current) throw new Error('STALE_OPERATION');
    if (rendering.busy || openingRef.current) throw new Error('EDITOR_BUSY');
    const current = document.getSnapshot();
    document.change(Array.isArray(commands) ? editCompositionSnapshot(current, commands)
      : compositionSnapshot(current, commands, current.cues));
  }

  function changeLayerCues(next: Cue[], name = activeTextLayer,
    options: { language?: TextLanguage; origin?: LayerOrigin } = {}) {
    try {
      assertCues(next);
      if (next.some(cue => cue.end_ms > duration)) throw new Error('INVALID_CUES');
      document.change(editTextLayer(document.getSnapshot(), name, next, options));
      return true;
    } catch (reason) { report(reason); return false; }
  }

  function selectTextLayer(name: TextLayerName) {
    setActiveTextLayer(name);
    setSelected(getTextLayer(document.getSnapshot(), name).cues[0]?.id ?? '');
  }

  function applyLayerCopy(preview: LayerCopyPreview, expectedRevision: number) {
    if (expectedRevision !== rev.current) throw new Error('STALE_OPERATION');
    if (openingRef.current) throw new Error('EDITOR_BUSY');
    const next = applyTextCopy(document.getSnapshot(), preview);
    if (getTextLayer(next, preview.to).cues.some(cue => cue.end_ms > duration)) throw new Error('INVALID_CUES');
    document.change(next);
  }

  function reviewLayerSource(preview: LayerCopyPreview, expectedRevision: number) {
    if (expectedRevision !== rev.current) throw new Error('STALE_OPERATION');
    if (openingRef.current) throw new Error('EDITOR_BUSY');
    document.change(reviewTextCopy(document.getSnapshot(), preview));
  }

  function applyTranslation(preview: TranslationPreview, expectedRevision: number) {
    if (expectedRevision !== rev.current) throw new Error('STALE_OPERATION');
    if (openingRef.current) throw new Error('EDITOR_BUSY');
    const next = applyTranslatedDraft(document.getSnapshot(), preview);
    if (getTextLayer(next, 'translated').cues.some(cue => cue.end_ms > duration)) throw new Error('INVALID_CUES');
    document.change(next);
  }

  function applySpeech(result: SpeechResult, expectedRevision: number, requestId: string) {
    if (expectedRevision !== rev.current || result.asset_id !== media?.asset_id || composition) {
      throw new Error('STALE_OPERATION');
    }
    if (openingRef.current) throw new Error('EDITOR_BUSY');
    return changeLayerCues(result.cues, 'transcript', { language: result.language, origin: {
      kind: 'stt', request_id: requestId, source_sha256: result.source_sha256,
      start_ms: result.start_ms, end_ms: result.end_ms, model_id: result.model_id, runtime: result.runtime,
    } });
  }

  function applyOcr(result: OcrResult, expectedRevision: number) {
    if (expectedRevision !== rev.current || result.asset_id !== media?.asset_id || composition || openingRef.current) return false;
    return changeLayerCues(result.cues, 'displayed', { language: result.language, origin: {
      kind: 'ocr', request_id: result.analysis_id, source_sha256: result.source_sha256,
      start_ms: result.start_ms, end_ms: result.end_ms,
    } });
  }

  function restore(nextMedia: Media, snapshot: Snapshot) {
    setDocumentId(crypto.randomUUID());
    setActiveTextLayer('displayed');
    setMedia(nextMedia);
    document.restore(snapshot);
    setSelected(snapshot.cues[0]?.id || '');
    rendering.setPreview(null);
    setAss(null);
    setClock(0);
    rev.current += 1;
    setRevision(rev.current);
    setDirty(false);
    setError('');
    setStatus('ready');
  }

  async function loadSource(load: () => Promise<{ media: Media; snapshot: Snapshot } | null>) {
    if (openingRef.current || rendering.busy) throw new Error('EDITOR_BUSY');
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
      restore(value.media, value.snapshot);
      return true;
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }

  function initialSnapshot(value: Media): Snapshot {
    return { cues: [], sample: { start_ms: 0, end_ms: Math.min(10000, value.duration_ms) } };
  }

  async function open() {
    try {
      await loadSource(async () => {
        const value = await unwrap<Media | null>(window.reupmatic.open());
        return value ? { media: value, snapshot: initialSnapshot(value) } : null;
      });
    } catch (reason) { report(reason); }
  }

  async function openLibrary(id: string, projectId?: string) {
    return loadSource(async () => {
      if (projectId) return unwrap(window.reupmatic.libraryOpenProject(id, projectId));
      const value = await unwrap(window.reupmatic.libraryOpen(id));
      return { media: value, snapshot: initialSnapshot(value) };
    });
  }

  async function openProject() {
    try {
      await loadSource(() => unwrap(window.reupmatic.openProject()));
    } catch (reason) { report(reason); }
  }

  async function openRecovery(id: string, expected_revision: number) {
    try {
      if (await loadSource(() => unwrap(window.reupmatic.recoveryOpen({ id, expected_revision })))) setDirty(true);
    } catch (reason) { report(reason); }
  }

  async function saveCurrentProject() {
    if (!media || savingProject) return;
    const savedRevision = rev.current;
    try {
      setSavingProject(true);
      const start = Math.round(Number(sampleStart) * 1000);
      const end = Math.round(Number(sampleEnd) * 1000);
      if (!sampleStart.trim() || !sampleEnd.trim() || !Number.isFinite(start)
        || !Number.isFinite(end) || start < 0 || end <= start || end > duration) {
        throw new Error('INVALID_PROJECT');
      }
      const value = await unwrap<SaveResult | null>(window.reupmatic.saveProject({
        asset_id: media.asset_id, revision: savedRevision,
        snapshot: { ...snapshot, sample: { start_ms: start, end_ms: end } },
      }));
      if (value?.saved) {
        setStatus(media?.library_id && value.library_linked === false ? 'savedWithoutLibraryLink' : 'saved');
        if (savedRevision === rev.current) {
          setDirty(false);
          await autosave.clearSaved(savedRevision);
        }
      }
    } catch (reason) { report(reason); }
    finally { setSavingProject(false); }
  }

  async function importSubtitles() {
    const captured = rev.current;
    const target = activeTextLayer;
    if (getTextLayer(document.getSnapshot(), target).cues.length
      && !(await confirm(t('textConfirmImport', { layer: t(`textLayer_${target}`) })))) return;
    try {
      const value = await unwrap<{ cues: Cue[] } | null>(window.reupmatic.importSubtitles());
      if (value) {
        if (captured !== rev.current) throw new Error('STALE_OPERATION');
        if (changeLayerCues(value.cues, target, { origin: { kind: 'srt' } })) {
          setActiveTextLayer(target); setSelected(value.cues[0]?.id || '');
        }
      }
    } catch (reason) { report(reason); }
  }

  async function saveSubtitles(timing: 'source' | 'output' = 'source', format: 'srt' | 'ass' = 'srt') {
    try {
      const currentCues = getTextLayer(document.getSnapshot(), activeTextLayer).cues;
      const outputCues = timing === 'output' && media
        ? retimeCues(currentCues, resolveEditWindow(processing?.editing, duration)) : currentCues;
      const value = await unwrap<SaveResult | null>(window.reupmatic.saveSubtitles({ cues: outputCues, timing, format,
        ...(composition ? { composition } : {}),
        ...(format === 'ass' && activeTextLayer === 'displayed' && processing?.subtitle_style ? { style: processing.subtitle_style } : {}),
        ...(timing === 'output' && processing?.editing ? { editing: processing.editing } : {}),
        ...(media ? { asset_id: media.asset_id } : {}) }));
      if (value?.saved) setStatus(media?.library_id && value.library_linked === false ? 'savedWithoutLibraryLink' : 'saved');
    } catch (reason) { report(reason); }
  }

  async function saveVideo(artifactId: string) {
    try {
      const value = await unwrap<SaveResult | null>(window.reupmatic.saveVideo(artifactId));
      if (value?.saved) setStatus(media?.library_id && value.library_linked === false ? 'savedWithoutLibraryLink' : 'saved');
    } catch (reason) { report(reason); }
  }

  function render(mode: 'sample' | 'full') {
    if (openingRef.current) return;
    setError('');
    return rendering.render(mode, { media, cues, revision, sampleStart, sampleEnd, processing, soundtrack, composition });
  }

  return {
    activeTextLayer, selectTextLayer, activeLayer, changeLayerCues, applyLayerCopy, reviewLayerSource, applyTranslation, applySpeech, applyOcr, textSnapshot: snapshot,
    documentId, autosave, openRecovery, media, duration, composition, applyComposition, cap, error, setError, history, cues, selected, setSelected, revision, rev,
    soundtrack, changeSoundtrack: (value: Soundtrack | undefined) => document.change({ soundtrack: value }),
    processing, changeProcessing: (value: ProcessingRecipe | undefined) => document.change({ processing: value }),
    dirty, clock, sampleStart, sampleEnd, savingProject, status, ass, video, timeline,
    ...rendering, ...sourcePreview, opening, report, change, updateClock, open, openLibrary, openProject, saveCurrentProject,
    importSubtitles, saveSubtitles, saveVideo, undo: document.undo, redo: document.redo, render,
    changeSampleStart: (value: string) => document.change({ sample: { ...snapshot.sample, start_ms: Math.round(Number(value) * 1000) } }),
    changeSampleEnd: (value: string) => document.change({ sample: { ...snapshot.sample, end_ms: Math.round(Number(value) * 1000) } }),
  };
}
