import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  previewTranslation,
  type TranslationPreview,
} from '../../../../core/speech/translation/review';
import type { TranslationPolicy } from '../../../../core/speech/translation/rules';
import { useEditor } from '../../editor/EditorContext';
import { translationErrorKey } from './i18n';
import type { TranslationDraft } from './useTranslationJob';

export function TranslationReview({
  draft,
  disabled,
  onApplied,
}: {
  draft: TranslationDraft;
  disabled: boolean;
  onApplied: () => void;
}) {
  const { t } = useTranslation(),
    editor = useEditor();
  const [policy, setPolicy] = useState<TranslationPolicy>('keep-existing');
  const [preview, setPreview] = useState<{ value: TranslationPreview; revision: number } | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false),
    [page, setPage] = useState(0),
    [error, setError] = useState('');
  const p = draft.input.params;
  const fresh =
    preview && preview.revision === editor.revision && draft.documentId === editor.documentId;
  const before = new Map(preview?.value.before.map((cue) => [cue.id, cue]) ?? []);
  const source = new Map(p.cues.map((cue) => [cue.id, cue]));
  const generated = new Map(draft.result.cues.map((cue) => [cue.id, cue]));
  const after = new Map(preview?.value.cues.map((cue) => [cue.id, cue]) ?? []);
  const ids = [...new Set([...source.keys(), ...before.keys()])];
  const requiresConfirmation = policy === 'replace-all' && Boolean(preview?.value.before.length);
  function review() {
    setPreview(null);
    setConfirmed(false);
    setPage(0);
    try {
      if (draft.documentId !== editor.documentId) throw new Error('STALE_OPERATION');
      setPreview({
        value: previewTranslation(editor.textSnapshot, draft.input, draft.result, policy),
        revision: editor.rev.current,
      });
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'STALE_OPERATION');
    }
  }
  return (
    <div className="business-form">
      <h3>{t('translationDraft')}</h3>
      <p>
        {t('translationCaptured', {
          source: t(`textLayer_${p.source_layer}`),
          from: t(`visionLanguage_${p.source_language}`),
          to: t(`visionLanguage_${p.target_language}`),
          count: p.cues.length,
          rules: p.rules.length,
          runtime: draft.result.runtime,
        })}
      </p>
      <p className="field-help">{t('translationCapturedHelp')}</p>
      {p.rules.length > 0 && (
        <fieldset aria-label={t('translationRules')}>
          {p.rules.map((rule) => (
            <p key={`${rule.find}→${rule.replace}`}>
              <code>{rule.find}</code> → <code>{rule.replace || '∅'}</code>
            </p>
          ))}
        </fieldset>
      )}
      <RadioList
        label={t('translationPolicy')}
        value={policy}
        onChange={(value) => {
          if (value === 'keep-existing' || value === 'replace-all') {
            setPolicy(value);
            setPreview(null);
            setConfirmed(false);
          }
        }}
      >
        <RadioListItem value="keep-existing" label={t('translationKeep')} />
        <RadioListItem value="replace-all" label={t('translationReplace')} />
      </RadioList>
      <p>{t(policy === 'keep-existing' ? 'translationKeepHelp' : 'translationReplaceHelp')}</p>
      <Button
        label={t('translationReview')}
        isDisabled={disabled || editor.opening}
        onClick={review}
      />
      {error && (
        <Banner
          status="error"
          title={t(translationErrorKey(error))}
          description={<code>{error}</code>}
        />
      )}
      {preview && (
        <>
          <p role="status">
            {t('translationCounts', {
              kept: preview.value.kept,
              added: preview.value.added,
              replaced: preview.value.replaced,
              removed: preview.value.removed,
            })}
          </p>
          {!fresh && (
            <Banner
              status="warning"
              title={t('rulesStale')}
              description={t('translationStaleHelp')}
            />
          )}
          <Table density="compact" aria-label={t('translationComparison')}>
            <TableHeader>
              <TableRow isHeaderRow>
                <TableHeaderCell>{t('speechTime')}</TableHeaderCell>
                <TableHeaderCell>{t('translationSource')}</TableHeaderCell>
                <TableHeaderCell>{t('rulesBefore')}</TableHeaderCell>
                <TableHeaderCell>{t('translationGenerated')}</TableHeaderCell>
                <TableHeaderCell>{t('translationAfter')}</TableHeaderCell>
                <TableHeaderCell>{t('translationFinalTime')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ids.slice(page * 25, (page + 1) * 25).map((id) => {
                const cue = source.get(id) ?? before.get(id);
                if (!cue) return null;
                const finalCue = after.get(id);
                return (
                  <TableRow key={id}>
                    <TableCell>
                      {cue.start_ms / 1000}–{cue.end_ms / 1000}
                    </TableCell>
                    {(
                      [
                        ['source', source],
                        ['before', before],
                        ['generated', generated],
                        ['after', after],
                      ] as const
                    ).map(([column, values]) => (
                      <TableCell key={column}>
                        <span className="rule-comparison-text">{values.get(id)?.text ?? '—'}</span>
                      </TableCell>
                    ))}
                    <TableCell>
                      {finalCue ? `${finalCue.start_ms / 1000}–${finalCue.end_ms / 1000}` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="action-row">
            <Button
              label={t('translationPrevious')}
              isDisabled={page === 0}
              onClick={() => setPage(page - 1)}
            />
            <span>
              {t('translationPage', {
                page: page + 1,
                total: Math.max(1, Math.ceil(ids.length / 25)),
              })}
            </span>
            <Button
              label={t('translationNext')}
              isDisabled={(page + 1) * 25 >= ids.length}
              onClick={() => setPage(page + 1)}
            />
          </div>
          {requiresConfirmation && (
            <CheckboxInput
              label={t('translationConfirm')}
              value={confirmed}
              onChange={setConfirmed}
            />
          )}
          <Button
            label={t('translationApply')}
            variant="primary"
            isDisabled={
              !fresh || disabled || editor.opening || (requiresConfirmation && !confirmed)
            }
            onClick={() => {
              try {
                editor.applyTranslation(preview.value, preview.revision);
                onApplied();
                setPreview(null);
                setError('');
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'STALE_OPERATION');
              }
            }}
          />
        </>
      )}
    </div>
  );
}
