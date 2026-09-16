import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextRule, TextRulePreview } from '../../../../core/subtitles/text-rules';
import { useEditor } from '../EditorContext';
import { BulkTimingControls } from './BulkTimingControls';

interface Preview { result: TextRulePreview; revision: number; settings: string }

export function TextRulePanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [rule, setRule] = useState<TextRule>({ mode: 'literal', find: '', replacement: '', case_sensitive: true });
  const [scope, setScope] = useState('all');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancel = useRef<(() => void) | undefined>(undefined);
  const settings = JSON.stringify({ layer: editor.activeTextLayer, rule, scope, selected: scope === 'selected' ? editor.selected : null });
  const applicable = preview && preview.revision === editor.revision && preview.settings === settings;
  useEffect(() => () => cancel.current?.(), []);

  function run() {
    cancel.current?.();
    setBusy(true); setPreview(null); setError('');
    const revision = editor.rev.current;
    let worker: Worker;
    try { worker = new Worker(new URL('./text-rule.worker.ts', import.meta.url), { type: 'module' }); }
    catch { setBusy(false); setError('TEXT_RULE_UNAVAILABLE'); return; }
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true; clearTimeout(timer); worker.terminate(); cancel.current = undefined; setBusy(false);
    };
    const timer = setTimeout(() => { finish(); setError('TEXT_RULE_TIMEOUT'); }, 2000);
    cancel.current = finish;
    worker.onerror = () => { finish(); setError('TEXT_RULE_UNAVAILABLE'); };
    worker.onmessage = event => {
      if (ended) return;
      finish();
      if (event.data.ok) setPreview({ result: event.data.result, revision, settings });
      else setError(event.data.error);
    };
    worker.postMessage({ cues: editor.activeLayer.cues, rule, ids: scope === 'selected' ? [editor.selected] : undefined });
  }

  return <div className="business-form">
    <Collapsible trigger={t('rulesTitle')} defaultIsOpen={false}>
      <p className="field-help">{t('rulesLayerNamed', { layer: t(`textLayer_${editor.activeTextLayer}`) })}</p>
      <div className="business-toolbar">
        <Selector label={t('rulesMode')} value={rule.mode} options={['literal', 'regex'].map(mode => ({
          value: mode, label: t(`rulesMode_${mode}`),
        }))} onChange={mode => setRule({ ...rule, mode: mode as TextRule['mode'] })} />
        <Selector label={t('rulesScope')} value={scope} onChange={setScope}
          options={['all', 'selected'].map(value => ({ value, label: t(`rulesScope_${value}`) }))} />
        <CheckboxInput label={t('rulesCase')} value={rule.case_sensitive}
          onChange={case_sensitive => setRule({ ...rule, case_sensitive })} />
      </div>
      <div className="business-toolbar">
        <TextInput label={t('find')} value={rule.find} onChange={find => setRule({ ...rule, find })} />
        <TextInput label={t('replace')} value={rule.replacement} onChange={replacement => setRule({ ...rule, replacement })} />
        <Button label={t('rulesPreview')} isDisabled={busy || !rule.find || !editor.activeLayer.cues.length || (scope === 'selected' && !editor.selected)} onClick={run} />
        {busy && <Button label={t('cancel')} onClick={() => cancel.current?.()} />}
      </div>
      {rule.mode === 'regex' && <p className="field-help">{t('rulesRegexHelp')}</p>}
      {error && <Banner status="error" title={t(error === 'TEXT_RULE_TIMEOUT' ? 'rulesTimeout' : 'rulesInvalid')} description={<code>{error}</code>} />}
      {preview && <>
        <span role="status">{t('rulesResult', { count: preview.result.matched_cues, matches: preview.result.replacements })}</span>
        {!applicable && <p role="status">{t('rulesStale')}</p>}
        <Table density="compact" aria-label={t('rulesComparison')}>
          <TableHeader><TableRow isHeaderRow><TableHeaderCell>{t('rulesBefore')}</TableHeaderCell>
            <TableHeaderCell>{t('rulesAfter')}</TableHeaderCell></TableRow></TableHeader>
          <TableBody>{preview.result.changes.slice(0, 25).map(change => <TableRow key={change.id}>
            <TableCell><span className="rule-comparison-text">{change.before}</span></TableCell>
            <TableCell><span className="rule-comparison-text">{change.after}</span></TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {preview.result.matched_cues > 25 && <p>{t('rulesMore')}</p>}
        <Button label={t('rulesApply')} variant="primary" isDisabled={!applicable || !preview.result.matched_cues}
          onClick={() => {
            if (preview.revision === editor.rev.current && preview.settings === settings) {
              editor.changeLayerCues(preview.result.cues); setPreview(null);
            }
          }} />
      </>}
    </Collapsible>
    <BulkTimingControls />
  </div>;
}
