import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditingRecipe } from '../../../core/editing/edit-recipe';
import { registerMenuCommand } from '../../shell/menuCommands';
import { useEditor } from './EditorContext';
import { useEditorTools } from './EditorToolContext';

type ExportKind = 'video' | 'subtitle' | 'both';
type Output = NonNullable<EditingRecipe['output']>;

const DEFAULT_OUTPUT: Output = { aspect: 'source', fit: 'contain', height: 0 };

export function EditorExportDialog() {
  const { t } = useTranslation();
  const editor = useEditor();
  const { activeTool, selectTool } = useEditorTools();
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<ExportKind>('video');
  const [format, setFormat] = useState<'srt' | 'ass'>('srt');
  const [timing, setTiming] = useState<'source' | 'output'>('source');
  const [running, setRunning] = useState(false);

  useEffect(() => registerMenuCommand('editor.export', () => setIsOpen(true)), []);
  useEffect(
    () =>
      registerMenuCommand('editor.exportSubtitles', () => {
        setKind('subtitle');
        setIsOpen(true);
      }),
    [],
  );

  const output = editor.processing?.editing?.output ?? DEFAULT_OUTPUT;
  function changeOutput(patch: Partial<Output>) {
    const editing = { ...editor.processing?.editing, output: { ...output, ...patch } };
    editor.changeProcessing({ ...(editor.processing ?? {}), editing });
  }

  const steps = [
    editor.cues.length > 0 && t('exportStepSubtitles'),
    editor.processing?.ocr && t('exportStepOcr'),
    editor.processing?.subtitle_style?.cover && t('exportStepCover'),
    editor.processing?.editing?.trim && t('exportStepTrim'),
    editor.processing?.editing?.crop && t('exportStepCrop'),
    editor.processing?.editing?.speed &&
      editor.processing.editing.speed !== 1 &&
      t('exportStepSpeed'),
    editor.soundtrack && t('exportStepMusic'),
    editor.voiceTrack && t('exportStepVoice'),
    editor.processing?.editing?.logo && t('exportStepLogo'),
  ].filter((value): value is string => Boolean(value));

  const disabled = running || editor.opening || editor.busy || !editor.media;

  async function run() {
    setRunning(true);
    try {
      if (kind !== 'video') await editor.saveSubtitles(timing, format);
      if (kind !== 'subtitle') await editor.render();
      // The monitor owns the progress and the result; the dialog only starts the job.
      setIsOpen(false);
    } finally {
      setRunning(false);
    }
  }

  const aspectLabel = output.aspect === 'source' ? t('exportAspectSource') : output.aspect;
  const fitLabel = output.fit === 'contain' ? t('exportFitContain') : t('exportFitCover');

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
        <Layout
          header={<DialogHeader title={t('exportDialogTitle')} onOpenChange={setIsOpen} />}
          content={
            <LayoutContent>
              <VStack gap={3}>
                <Selector
                  label={t('exportKindLabel')}
                  value={kind}
                  isDisabled={disabled}
                  options={[
                    { value: 'video', label: t('exportKindVideo') },
                    { value: 'subtitle', label: t('exportKindSubtitle') },
                    { value: 'both', label: t('exportKindBoth') },
                  ]}
                  onChange={(value) => setKind(value as ExportKind)}
                />
                {kind !== 'video' && (
                  <>
                    <Selector
                      label={t('styleExportFormat')}
                      value={format}
                      isDisabled={disabled}
                      options={[
                        { value: 'srt', label: 'SRT' },
                        { value: 'ass', label: 'ASS' },
                      ]}
                      onChange={(value) => {
                        if (value === 'srt' || value === 'ass') setFormat(value);
                      }}
                    />
                    {format === 'srt' && (
                      <Text as="p" type="body">
                        {t('styleExportSrtNote')}
                      </Text>
                    )}
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
                  </>
                )}
                {kind !== 'subtitle' && (
                  <>
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
                      onChange={(value) =>
                        changeOutput({ height: Number(value) as Output['height'] })
                      }
                    />
                    <VStack gap={1}>
                      <Text as="p" type="body">
                        {t('exportSizeAspect')}: {aspectLabel}
                      </Text>
                      <Text as="p" type="body">
                        {t('exportSizeFit')}: {fitLabel}
                      </Text>
                      <Button
                        label={t('exportEditFraming')}
                        variant="ghost"
                        size="sm"
                        isDisabled={disabled}
                        onClick={() => {
                          if (activeTool !== 'video') selectTool('video');
                          setIsOpen(false);
                        }}
                      />
                    </VStack>
                  </>
                )}
                {steps.length > 0 && (
                  <VStack gap={1}>
                    <Text as="p" type="body">
                      {t('exportStepsSummary')}
                    </Text>
                    <List density="compact" aria-label={t('exportStepsSummary')}>
                      {steps.map((step) => (
                        <ListItem key={step} label={step} />
                      ))}
                    </List>
                  </VStack>
                )}
                {(running || editor.job) && (
                  <Text as="p" type="body" role="status">
                    {editor.job ? t(editor.job.phase) : t('exportRendering')}
                  </Text>
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label={t('cancel')} onClick={() => setIsOpen(false)} />
                <Button
                  label={t('exportRun')}
                  variant="primary"
                  isDisabled={disabled}
                  onClick={() => void run()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}
