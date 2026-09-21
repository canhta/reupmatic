import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseSynthesisStatus,
  type SynthesisInput,
  type SynthesisResult,
  type SynthesisStatus,
  validateSynthesisResult,
} from '../../../../core/speech/synthesis/contracts';
import { prepareSynthesis, type SynthesisOptions } from '../../../../core/speech/synthesis/review';
import type { TextSnapshot } from '../../../../core/subtitles/layers/document';
import { unwrap } from '../../../bridge/client';

interface Context {
  documentId: string;
  revision: number;
  snapshot: TextSnapshot;
  opening: boolean;
}
interface Active {
  input: SynthesisInput;
  documentId: string;
  phase: string;
  fraction: number | null;
  engine: string;
}
export interface SynthesisDraft {
  input: SynthesisInput;
  result: SynthesisResult;
  documentId: string;
  engine: string;
}

export function useSynthesisJob(context: Context) {
  const current = useRef(context);
  current.current = context;
  const alive = useRef(true),
    operation = useRef<Active | null>(null),
    configuring = useRef(false);
  const sequence = useRef(0);
  const [models, setModels] = useState<SynthesisStatus | null>(null);
  const [checking, setChecking] = useState(false),
    [settingUp, setSettingUp] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [draft, setDraft] = useState<SynthesisDraft | null>(null);
  const [error, setError] = useState('');
  const report = useCallback((reason: unknown) => {
    if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
  }, []);
  const refresh = useCallback(async () => {
    const captured = ++sequence.current;
    setChecking(true);
    try {
      const status = parseSynthesisStatus(await unwrap(window.reupmatic.synthesisStatus()));
      if (alive.current && captured === sequence.current) setModels(status);
    } catch (reason) {
      report(reason);
    } finally {
      if (alive.current && captured === sequence.current) setChecking(false);
    }
  }, [report]);

  useEffect(() => {
    alive.current = true;
    const off = window.reupmatic.onSynthesisJob((message) => {
      const request = operation.current;
      if (
        !request ||
        message.id !== request.input.request_id ||
        message.revision !== request.input.revision
      )
        return;
      if (message.event === 'progress') {
        if (request.phase === 'cancelling') return;
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
      if (request.documentId !== current.current.documentId) return;
      try {
        const result = validateSynthesisResult(message.data, request.input);
        setDraft({
          input: request.input,
          result,
          documentId: request.documentId,
          engine: request.engine,
        });
      } catch (reason) {
        report(reason);
      }
    });
    const offModels = window.reupmatic.onSynthesisModelsChanged(() => {
      void refresh();
    });
    void refresh();
    return () => {
      alive.current = false;
      off();
      offModels();
      const request = operation.current;
      operation.current = null;
      if (request)
        void window.reupmatic.synthesisCancel(request.input.request_id).catch(() => undefined);
      if (configuring.current) void window.reupmatic.synthesisCancelSetup().catch(() => undefined);
    };
  }, [refresh, report]);

  async function configure() {
    if (configuring.current || operation.current) return;
    configuring.current = true;
    setSettingUp(true);
    setError('');
    try {
      await unwrap(window.reupmatic.synthesisConfigure());
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

  async function start(options: Omit<SynthesisOptions, 'request_id' | 'revision' | 'model_id'>) {
    if (operation.current || configuring.current) return;
    const requestId = crypto.randomUUID();
    let admitted = false;
    try {
      const c = current.current;
      if (c.opening) throw new Error('EDITOR_BUSY');
      if (!models?.available || !models.model_id || !models.engine)
        throw new Error(models?.code || 'MODEL_MISSING');
      if (!models.languages.includes(options.language))
        throw new Error('MODEL_LANGUAGE_UNAVAILABLE');
      if (!models.voices.some((voice) => voice.id === options.voice_id))
        throw new Error('SYNTHESIS_VOICE_UNAVAILABLE');
      const input = prepareSynthesis(c.snapshot, {
        ...options,
        request_id: requestId,
        revision: c.revision,
        model_id: models.model_id,
      });
      const request: Active = {
        input,
        documentId: c.documentId,
        phase: 'queued',
        fraction: null,
        engine: models.engine,
      };
      operation.current = request;
      admitted = true;
      setActive(request);
      setError('');
      await unwrap(window.reupmatic.synthesisStart(input));
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
      await unwrap(window.reupmatic.synthesisCancel(request.input.request_id));
      if (operation.current?.input.request_id === request.input.request_id && alive.current) {
        const next = { ...request, phase: 'cancelling', fraction: null };
        operation.current = next;
        setActive(next);
      }
    } catch (reason) {
      if (operation.current?.input.request_id === request.input.request_id) report(reason);
    }
  }

  return {
    models,
    checking,
    settingUp,
    active,
    draft,
    error,
    refresh,
    configure,
    start,
    cancel,
    report,
    cancelSetup: async () => {
      try {
        await unwrap(window.reupmatic.synthesisCancelSetup());
      } catch (reason) {
        report(reason);
      }
    },
  };
}
