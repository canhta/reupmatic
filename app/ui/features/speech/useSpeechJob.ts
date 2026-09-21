import { useCallback, useEffect, useRef, useState } from 'react';
import {
  offeredSpeechEngines,
  speechProblemCode as problemCode,
} from '../../../core/speech/engine-capability';
import {
  parseSpeechInput,
  type SpeechLanguage,
  type SpeechResult,
  type SpeechStatus,
} from '../../../core/speech/recognition';
import { unwrap } from '../../bridge/client';

export { problemCode };

export interface SpeechContext {
  documentId: string;
  assetId: string;
  revision: number;
  duration: number;
  start: string;
  end: string;
  hasAudio: boolean;
  composed: boolean;
}
interface Active {
  id: string;
  revision: number;
  phase: string;
  fraction: number | null;
  documentId: string;
}
export interface SpeechDraft {
  data: SpeechResult;
  revision: number;
  requestId: string;
  documentId: string;
}

export function useSpeechJob(context: SpeechContext) {
  const current = useRef(context);
  current.current = context;
  const alive = useRef(true),
    operation = useRef<Active | null>(null),
    configuring = useRef(false);
  const [models, setModels] = useState<SpeechStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [draft, setDraft] = useState<SpeechDraft | null>(null);
  const [error, setError] = useState('');
  const checkSequence = useRef(0);
  const report = useCallback((reason: unknown) => {
    if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++checkSequence.current;
    setChecking(true);
    try {
      const value = await unwrap(window.reupmatic.speechStatus());
      if (alive.current && sequence === checkSequence.current) setModels(value);
    } catch (reason) {
      report(reason);
    } finally {
      if (alive.current && sequence === checkSequence.current) setChecking(false);
    }
  }, [report]);

  useEffect(() => {
    alive.current = true;
    const off = window.reupmatic.onSpeechJob((message) => {
      const request = operation.current;
      if (!request || message.id !== request.id || message.revision !== request.revision) return;
      if (message.event === 'progress') {
        const next = { ...request, ...message.data };
        operation.current = next;
        setActive(next);
        return;
      }
      operation.current = null;
      setActive(null);
      if (message.event === 'error') {
        setError(message.data.code);
        return;
      }
      // Capture the run's own document id; the provider outlives opening a video.
      if (
        message.data.asset_id !== current.current.assetId ||
        request.documentId !== current.current.documentId
      )
        return;
      setDraft({
        data: message.data,
        revision: request.revision,
        requestId: request.id,
        documentId: request.documentId,
      });
    });
    const offModels = window.reupmatic.onSpeechModelsChanged(() => {
      void refresh();
    });
    void refresh();
    return () => {
      alive.current = false;
      off();
      offModels();
      const request = operation.current;
      operation.current = null;
      if (request) void window.reupmatic.speechCancel(request.id).catch(() => undefined);
      if (configuring.current) void window.reupmatic.speechCancelSetup().catch(() => undefined);
    };
  }, [refresh]);

  async function configure() {
    if (configuring.current || operation.current) return;
    configuring.current = true;
    setSettingUp(true);
    setError('');
    try {
      await unwrap(window.reupmatic.speechConfigure());
    } catch (reason) {
      report(reason);
    } finally {
      configuring.current = false;
      if (alive.current) {
        setSettingUp(false);
        void refresh();
      }
    }
  }

  async function start(language: SpeechLanguage, scope: 'sample' | 'full', engineId: string) {
    if (operation.current || configuring.current) return;
    const requestId = crypto.randomUUID();
    let admitted = false;
    try {
      const c = current.current;
      if (c.composed) throw new Error('SPEECH_COMPOSITION_UNAVAILABLE');
      if (!c.hasAudio) throw new Error('NO_AUDIO');
      const engine = models
        ? offeredSpeechEngines(models, language).find((entry) => entry.engine === engineId)
        : undefined;
      if (!engine?.model_id) throw new Error(problemCode(models, language));
      if (scope === 'sample' && (!c.start.trim() || !c.end.trim()))
        throw new Error('INVALID_REQUEST');
      const input = parseSpeechInput({
        request_id: requestId,
        revision: c.revision,
        params: {
          asset_id: c.assetId,
          model_id: engine.model_id,
          language,
          start_ms: scope === 'full' ? 0 : Math.round(Number(c.start) * 1000),
          end_ms: scope === 'full' ? c.duration : Math.round(Number(c.end) * 1000),
        },
      });
      if (input.params.end_ms > c.duration) throw new Error('INVALID_REQUEST');
      const request: Active = {
        id: requestId,
        revision: c.revision,
        phase: 'queued',
        fraction: null,
        documentId: c.documentId,
      };
      operation.current = request;
      admitted = true;
      setActive(request);
      setError('');
      await unwrap(window.reupmatic.speechStart(input));
    } catch (reason) {
      if (admitted && operation.current?.id !== requestId) return;
      operation.current = null;
      if (alive.current) setActive(null);
      report(reason);
    }
  }

  async function cancel() {
    const request = operation.current;
    if (!request) return;
    try {
      await unwrap(window.reupmatic.speechCancel(request.id));
      if (operation.current?.id === request.id && alive.current) {
        const next = { ...request, phase: 'cancelling', fraction: null };
        operation.current = next;
        setActive(next);
      }
    } catch (reason) {
      if (operation.current?.id === request.id) report(reason);
    }
  }

  function review(captured: SpeechDraft) {
    const c = current.current;
    if (
      c.composed ||
      captured.documentId !== c.documentId ||
      captured.data.asset_id !== c.assetId
    ) {
      report(new Error('STALE_OPERATION'));
      return;
    }
    setDraft((value) => (value === captured ? { ...captured, revision: c.revision } : value));
  }

  return {
    models,
    checking,
    settingUp,
    active,
    draft,
    error,
    report,
    refresh,
    configure,
    start,
    cancel,
    review,
    consume: (captured: SpeechDraft) => setDraft((value) => (value === captured ? null : value)),
    cancelSetup: async () => {
      try {
        await unwrap(window.reupmatic.speechCancelSetup());
      } catch (reason) {
        report(reason);
      }
    },
  };
}
