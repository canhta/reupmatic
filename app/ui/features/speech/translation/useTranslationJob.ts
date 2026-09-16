import { useCallback, useEffect, useRef, useState } from 'react';
import { parseTranslationStatus, validateTranslationResult, type TranslationInput,
  type TranslationResult, type TranslationStatus } from '../../../../core/speech/translation/contracts';
import { prepareTranslation, type TranslationOptions } from '../../../../core/speech/translation/review';
import type { TextSnapshot } from '../../../../core/subtitles/layers/document';
import { unwrap } from '../../../bridge/client';

interface Context { documentId: string; revision: number; snapshot: TextSnapshot; opening: boolean }
interface Active { input: TranslationInput; documentId: string; phase: string; fraction: number | null }
export interface TranslationDraft { input: TranslationInput; result: TranslationResult; documentId: string }

export function useTranslationJob(context: Context) {
  const current = useRef(context);
  current.current = context;
  const alive = useRef(true), operation = useRef<Active | null>(null), configuring = useRef(false);
  const sequence = useRef(0);
  const [models, setModels] = useState<TranslationStatus | null>(null);
  const [checking, setChecking] = useState(false), [settingUp, setSettingUp] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [draft, setDraft] = useState<TranslationDraft | null>(null);
  const [error, setError] = useState('');
  const report = useCallback((reason: unknown) => {
    if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
  }, []);
  const refresh = useCallback(async () => {
    const captured = ++sequence.current;
    setChecking(true);
    try {
      const status = parseTranslationStatus(await unwrap(window.reupmatic.translationStatus()));
      if (alive.current && captured === sequence.current) setModels(status);
    } catch (reason) { report(reason); }
    finally { if (alive.current && captured === sequence.current) setChecking(false); }
  }, [report]);

  useEffect(() => {
    alive.current = true;
    const off = window.reupmatic.onTranslationJob(message => {
      const request = operation.current;
      if (!request || message.id !== request.input.request_id || message.revision !== request.input.revision) return;
      if (message.event === 'progress') {
        const next = { ...request, ...message.data };
        operation.current = next; setActive(next); return;
      }
      operation.current = null; setActive(null);
      if (message.event === 'error') { setError(message.data.code); return; }
      if (request.documentId !== current.current.documentId) return;
      try {
        const result = validateTranslationResult(message.data, request.input);
        setDraft({ input: request.input, result, documentId: request.documentId });
      } catch (reason) { report(reason); }
    });
    const offModels = window.reupmatic.onTranslationModelsChanged(() => { void refresh(); });
    void refresh();
    return () => {
      alive.current = false; off(); offModels();
      const request = operation.current;
      operation.current = null;
      if (request) void window.reupmatic.translationCancel(request.input.request_id).catch(() => undefined);
      if (configuring.current) void window.reupmatic.translationCancelSetup().catch(() => undefined);
    };
  }, [refresh, report]);

  async function configure() {
    if (configuring.current || operation.current) return;
    configuring.current = true; setSettingUp(true); setError('');
    try { await unwrap(window.reupmatic.translationConfigure()); }
    catch (reason) { report(reason); }
    finally {
      configuring.current = false;
      if (alive.current) { setSettingUp(false); void refresh(); }
    }
  }

  async function start(options: Omit<TranslationOptions, 'request_id' | 'revision' | 'model_id'>) {
    if (operation.current || configuring.current) return;
    const requestId = crypto.randomUUID();
    let admitted = false;
    try {
      const c = current.current;
      if (c.opening) throw new Error('EDITOR_BUSY');
      if (!models?.available || !models.model_id) throw new Error(models?.code || 'MODEL_MISSING');
      if (models.source_language !== options.source_language || models.target_language !== options.target_language) {
        throw new Error('MODEL_LANGUAGE_UNAVAILABLE');
      }
      const input = prepareTranslation(c.snapshot, { ...options, request_id: requestId,
        revision: c.revision, model_id: models.model_id });
      const request: Active = { input, documentId: c.documentId, phase: 'queued', fraction: null };
      operation.current = request; admitted = true; setActive(request); setError('');
      // A failed/cancelled retry never destroys the previous successful draft.
      await unwrap(window.reupmatic.translationStart(input));
    } catch (reason) {
      if (admitted && operation.current?.input.request_id !== requestId) return;
      operation.current = null;
      if (alive.current) setActive(null);
      report(reason);
    }
  }

  async function cancel() {
    const request = operation.current;
    if (!request) return;
    try {
      await unwrap(window.reupmatic.translationCancel(request.input.request_id));
      if (operation.current?.input.request_id === request.input.request_id && alive.current) {
        const next = { ...request, phase: 'cancelling', fraction: null };
        operation.current = next; setActive(next);
      }
    } catch (reason) { if (operation.current?.input.request_id === request.input.request_id) report(reason); }
  }

  return { models, checking, settingUp, active, draft, error, refresh, configure, start, cancel, report,
    consume: (captured: TranslationDraft) => setDraft(value => value === captured ? null : value),
    cancelSetup: async () => {
      try { await unwrap(window.reupmatic.translationCancelSetup()); } catch (reason) { report(reason); }
    },
  };
}
