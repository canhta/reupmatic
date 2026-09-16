import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InpaintResult, ModelStatus, OcrResult, VisionInput, VisionParams,
} from '../../../core/vision/vision';
import { unwrap } from '../../bridge/client';

export interface VisionContext {
  assetId: string;
  revision: number;
  start: string;
  end: string;
  duration: number;
}
export interface Captured<T> { data: T; revision: number }
interface Active { id: string; revision: number; phase: string; fraction: number | null }

export function useVisionJob(context: VisionContext) {
  const current = useRef(context);
  current.current = context;
  const [models, setModels] = useState<ModelStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [draft, setDraft] = useState<Captured<OcrResult> | null>(null);
  const [output, setOutput] = useState<Captured<InpaintResult> | null>(null);
  const [error, setError] = useState('');
  const operation = useRef<Active | null>(null);
  const checkingRef = useRef(false);
  const alive = useRef(true);

  const report = useCallback((reason: unknown) => {
    if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
  }, []);

  const refresh = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const status = await unwrap(window.reupmatic.visionStatus());
      if (alive.current) {
        setModels(status);
        setError('');
      }
    } catch (reason) {
      report(reason);
    } finally {
      checkingRef.current = false;
      if (alive.current) setChecking(false);
    }
  }, [report]);

  useEffect(() => {
    alive.current = true;
    const unsubscribe = window.reupmatic.onVisionJob(message => {
      const request = operation.current;
      if (!request || message.id !== request.id || message.revision !== request.revision) return;
      if (message.event === 'progress') {
        const next = { ...request, phase: message.data.phase, fraction: message.data.fraction };
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
      if (message.data.asset_id !== current.current.assetId) return;
      if (message.data.kind === 'ocr') setDraft({ data: message.data, revision: request.revision });
      else setOutput({ data: message.data, revision: request.revision });
    });
    const offModels = window.reupmatic.onModelsChanged(() => { void refresh(); });
    void refresh();
    return () => {
      alive.current = false;
      unsubscribe();
      offModels();
      const request = operation.current;
      operation.current = null;
      if (request) void window.reupmatic.visionCancel(request.id).catch(() => undefined);
    };
  }, [refresh]);

  async function start(method: VisionInput['method'], settings: Partial<VisionParams>) {
    if (operation.current) return;
    const id = crypto.randomUUID();
    let admitted = false;
    try {
      const { assetId, revision, start, end, duration } = current.current;
      const full = method === 'media.ocr.extract';
      const start_ms = full ? 0 : Math.round(Number(start) * 1000);
      const end_ms = full ? duration : Math.round(Number(end) * 1000);
      if ((!full && (!start.trim() || !end.trim())) || !Number.isFinite(start_ms) || !Number.isFinite(end_ms)
        || start_ms < 0 || end_ms <= start_ms || end_ms > duration) throw new Error('INVALID_REQUEST');
      if (!full && end_ms - start_ms > (method === 'media.ocr' ? 120000 : 10000)) throw new Error('VISION_LIMIT');
      const request = { id, revision, phase: 'queued', fraction: null };
      operation.current = request;
      admitted = true;
      setActive(request);
      setError('');
      await unwrap(window.reupmatic.visionStart({
        request_id: id, revision, method,
        params: { ...settings, asset_id: assetId, start_ms, end_ms },
      }));
      // The terminal event owns completion, even if it arrived before this reply.
    } catch (reason) {
      if (admitted && operation.current?.id !== id) return;
      operation.current = null;
      setActive(null);
      report(reason);
    }
  }

  async function cancel() {
    const request = operation.current;
    if (!request) return;
    try {
      await unwrap(window.reupmatic.visionCancel(request.id));
      if (operation.current?.id === request.id) {
        const next = { ...request, phase: 'cancelling', fraction: null };
        operation.current = next;
        setActive(next);
      }
    } catch (reason) {
      if (operation.current?.id === request.id) report(reason);
    }
  }

  function consumeDraft(captured: Captured<OcrResult>) {
    setDraft(previous => previous === captured ? null : previous);
  }

  return { models, checking, active, draft, output, error, report, refresh, start, cancel, consumeDraft };
}
