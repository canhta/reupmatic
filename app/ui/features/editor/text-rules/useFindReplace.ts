import { useEffect, useRef, useState } from 'react';
import type { TextRule, TextRulePreview } from '../../../../core/subtitles/text-rules';
import type { EditorSession } from '../useEditorSession';

interface Preview {
  result: TextRulePreview;
  revision: number;
  settings: string;
}

export function useFindReplace(editor: EditorSession, find: string) {
  const [replacement, setReplacement] = useState('');
  const [mode, setMode] = useState<TextRule['mode']>('literal');
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<(() => void) | undefined>(undefined);
  const rule: TextRule = { mode, find, replacement, case_sensitive: caseSensitive };
  const settings = JSON.stringify({
    layer: editor.activeTextLayer,
    rule,
    scope,
    selected: scope === 'selected' ? editor.selected : null,
  });
  const applicable =
    preview !== null && preview.revision === editor.revision && preview.settings === settings;

  useEffect(() => () => cancelRef.current?.(), []);

  function run() {
    cancelRef.current?.();
    setBusy(true);
    setPreview(null);
    setError('');
    const revision = editor.getRevision();
    let worker: Worker;
    try {
      worker = new Worker(new URL('./text-rule.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      setBusy(false);
      setError('TEXT_RULE_UNAVAILABLE');
      return;
    }
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      worker.terminate();
      cancelRef.current = undefined;
      setBusy(false);
    };
    const timer = setTimeout(() => {
      finish();
      setError('TEXT_RULE_TIMEOUT');
    }, 2000);
    cancelRef.current = finish;
    worker.onerror = () => {
      finish();
      setError('TEXT_RULE_UNAVAILABLE');
    };
    worker.onmessage = (event) => {
      if (ended) return;
      finish();
      if (event.data.ok) setPreview({ result: event.data.result, revision, settings });
      else setError(event.data.error);
    };
    worker.postMessage({
      cues: editor.activeLayer.cues,
      rule,
      ids: scope === 'selected' ? [editor.selected] : undefined,
    });
  }

  function cancel() {
    cancelRef.current?.();
  }

  function reset() {
    cancelRef.current?.();
    setPreview(null);
    setError('');
  }

  function apply() {
    if (!preview || preview.revision !== editor.getRevision() || preview.settings !== settings)
      return false;
    editor.changeLayerCues(preview.result.cues);
    reset();
    return true;
  }

  return {
    replacement,
    setReplacement,
    mode,
    setMode,
    caseSensitive,
    setCaseSensitive,
    scope,
    setScope,
    preview,
    busy,
    error,
    applicable,
    canRun: Boolean(find) && Boolean(editor.activeLayer.cues.length) && !busy,
    run,
    cancel,
    reset,
    apply,
  };
}
