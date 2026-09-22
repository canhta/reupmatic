import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../core/editing/edit-recipe';
import { registerMenuCommand } from '../../shell/menuCommands';
import { useEditor } from './EditorContext';

type ExportKind = 'video' | 'subtitle' | 'both';
type Output = NonNullable<EditingRecipe['output']>;

const DEFAULT_OUTPUT: Output = { aspect: 'source', fit: 'contain', height: 0 };

export function EditorExportDialog() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<ExportKind>('video');
  const [format, setFormat] = useState<'srt' | 'ass'>('srt');
  const [timing, setTiming] = useState<'source' | 'output'>('source');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  // Baseline artifact id is null on first render, so it needs its own "awaiting" flag.
  const awaitingSave = useRef(false);
  const baselineArtifact = useRef<string | null>(null);

  useEffect(() => registerMenuCommand('editor.export', () => setIsOpen(true)), []);
  useEffect(
    () =>
      registerMenuCommand('editor.exportSubtitles', () => {
        setKind('subtitle');
        setIsOpen(true);
      }),
    [],
  );

  useEffect(() => {
    if (!awaitingSave.current || !editor.preview) return;
    if (editor.preview.artifact_id === baselineArtifact.current) return;
    const artifact = editor.preview.artifact_id;
    awaitingSave.current = false;
    void editor.saveVideo(artifact).then(() => {
      setMessage(t('exportComplete'));
      setIsOpen(false);
    });
  }, [editor, editor.preview, t]);

  const output = editor.processing?.editing?.output ?? DEFAULT_OUTPUT;
  function changeOutput(patch: Partial<Output>) {
    const editing = { ...editor.processing?.editing, output: { ...output, ...patch } };
    editor.changeProcessing({ ...(editor.processing ?? {}), editing });
  }

  const steps = [
    editor.cues.length > 0 && t('exportStepSubtitles'),
    editor.processing?.ocr && t('exportStepOcr'),
    editor.processing?.inpaint && t('exportStepInpaint'),
    editor.processing?.editing?.trim && t('exportStepTrim'),
    editor.processing?.editing?.crop && t('exportStepCrop'),
    editor.processing?.editing?.speed &&
      editor.processing.editing.speed !== 1 &&
      t('exportStepSpeed'),
    editor.soundtrack && t('exportStepMusic'),
  ].filter((value): value is string => Boolean(value));

  const disabled = running || editor.opening || editor.busy || !editor.media;

  async function run() {
    setRunning(true);
    setMessage('');
    try {
      if (kind !== 'video') await editor.saveSubtitles(timing, format);
      if (kind !== 'subtitle') {
        awaitingSave.current = true;
        baselineArtifact.current = editor.preview?.artifact_id ?? null;
        await editor.render('full');
        setMessage(t('exportRendering'));
      } else {
        setMessage(t('exportComplete'));
        setIsOpen(false);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button
        label={t('exportButton')}
        variant="primary"
        size="sm"
        isDisabled={!editor.media || editor.renderUnavailable}
        onClick={() => {
          setKind('video');
          setIsOpen(true);
        }}
      />
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} width={480} purpose="form">
        <DialogHeader title={t('exportDialogTitle')} onOpenChange={setIsOpen} />
        <VStack gap={3}>
          <RadioList
            label={t('exportKindLabel')}
            value={kind}
            isDisabled={disabled}
            onChange={(value) => setKind(value as ExportKind)}
          >
            <RadioListItem value="video" label={t('exportKindVideo')} />
            <RadioListItem value="subtitle" label={t('exportKindSubtitle')} />
            <RadioListItem value="both" label={t('exportKindBoth')} />
          </RadioList>
          {kind !== 'video' && (
            <VStack gap={3}>
              <RadioList
                label={t('styleExportFormat')}
                value={format}
                isDisabled={disabled}
                onChange={(value) => {
                  if (value === 'srt' || value === 'ass') setFormat(value);
                }}
              >
                <RadioListItem value="srt" label="SRT" />
                <RadioListItem value="ass" label="ASS" />
              </RadioList>
              <Selector
                label={t('styleExportTiming')}
                value={timing}
                isDisabled={disabled}
                options={[
                  { value: 'source', label: t('styleExportSource') },
                  { value: 'output', label: t('styleExportOutput') },
                ]}
                onChange={(value) => {
                  if (value === 'source' || value === 'output') setTiming(value);
                }}
              />
            </VStack>
          )}
          {kind !== 'subtitle' && (
            <FormLayout direction="vertical">
              <Selector
                label={t('exportSizeAspect')}
                value={output.aspect}
                isDisabled={disabled}
                options={[
                  { value: 'source', label: t('exportAspectSource') },
                  { value: '9:16', label: '9:16' },
                  { value: '16:9', label: '16:9' },
                  { value: '1:1', label: '1:1' },
                  { value: '4:5', label: '4:5' },
                ]}
                onChange={(value) => changeOutput({ aspect: value as Output['aspect'] })}
              />
              <Selector
                label={t('exportSizeHeight')}
                value={String(output.height)}
                isDisabled={disabled}
                options={[
                  { value: '0', label: t('exportHeightSource') },
                  { value: '480', label: '480p' },
                  { value: '720', label: '720p' },
                  { value: '1080', label: '1080p' },
                  { value: '1920', label: '1920p' },
                ]}
                onChange={(value) => changeOutput({ height: Number(value) as Output['height'] })}
              />
            </FormLayout>
          )}
          {kind !== 'subtitle' && (
            <Collapsible trigger={t('exportAdvanced')} defaultIsOpen={false}>
              <Selector
                label={t('exportSizeFit')}
                value={output.fit}
                isDisabled={disabled}
                options={[
                  { value: 'contain', label: t('exportFitContain') },
                  { value: 'cover', label: t('exportFitCover') },
                ]}
                onChange={(value) => changeOutput({ fit: value as Output['fit'] })}
              />
            </Collapsible>
          )}
          {steps.length > 0 && (
            <div>
              <Text as="p" type="supporting">
                {t('exportStepsSummary')}
              </Text>
              <ul className="export-steps-summary">
                {steps.map((step) => (
                  <li key={step}>
                    <Text as="span" type="supporting">
                      {step}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(running || editor.job) && (
            <Text as="p" type="body" role="status">
              {editor.job ? t(editor.job.phase) : t('exportRendering')}
            </Text>
          )}
          {!running && !editor.job && message && (
            <Text as="p" type="body" role="status">
              {message}
            </Text>
          )}
          <Button
            label={t('exportRun')}
            variant="primary"
            isDisabled={disabled}
            onClick={() => void run()}
          />
        </VStack>
      </Dialog>
    </>
  );
}
