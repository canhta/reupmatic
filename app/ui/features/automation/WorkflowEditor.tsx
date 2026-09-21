import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Step, Stepper } from '@astryxdesign/core/Stepper';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SaveWorkflow } from '../../../core/automation/workflow-contracts';
import { ProcessingOptions } from '../processing/ProcessingOptions';
import { ProfilePicker } from '../profiles/ProfilePicker';
import { WorkflowInputPicker } from './WorkflowInputPicker';

export type WorkflowDraft = SaveWorkflow & { output_name: string };

export function WorkflowEditor({
  title,
  value,
  disabled,
  dirty,
  step,
  onStep,
  onChange,
  onPickOutput,
  onSave,
  onReset,
  onBack,
  saved,
}: {
  title: string;
  value: WorkflowDraft;
  disabled: boolean;
  dirty: boolean;
  step: number;
  onStep(step: number): void;
  onChange(next: WorkflowDraft): void;
  onPickOutput(): void;
  onSave(): void;
  onReset(): void;
  onBack(): void;
  saved: boolean;
}) {
  const { t } = useTranslation();
  const missing: string[] = [];
  if (!value.name.trim()) missing.push(t('workflowMissingName'));
  if (!value.item_ids.length) missing.push(t('workflowMissingInputs'));
  if (!value.output_name) missing.push(t('workflowMissingOutput'));
  const noChanges = !dirty && value.expected_revision !== null;
  const saveDisabled = disabled || missing.length > 0 || noChanges;
  const canvas = useRef<HTMLElement>(null);

  useEffect(() => {
    requestAnimationFrame(() =>
      canvas.current?.querySelector<HTMLElement>('input, button')?.focus(),
    );
  }, []);

  return (
    // Chromium cancels a confirmation <dialog> opened from this keydown in the same tick.
    <section
      ref={canvas}
      aria-label={title}
      className="workflow-editor"
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.stopPropagation();
        setTimeout(onBack, 0);
      }}
    >
      <div className="workflow-editor-header">
        <IconButton
          label={t('workflowBackToList')}
          tooltip={t('workflowBackToList')}
          variant="ghost"
          size="sm"
          icon={<Icon icon="chevronLeft" size="sm" />}
          onClick={onBack}
        />
        <Heading level={5}>{title}</Heading>
      </div>
      <Stepper
        activeStep={step}
        orientation="horizontal"
        onStepClick={onStep}
        label={title}
        density="compact"
        horizontalOptions={{ minimumStepWidth: 200, collapsedVariant: 'withLabelAndControls' }}
      >
        <Step step={0} label={t('workflowStepIdentity')} />
        <Step step={1} label={t('workflowInputs')} />
        <Step step={2} label={t('workflowStepProcessing')} />
        <Step step={3} label={t('workflowStepOutputs')} />
        <Step step={4} label={t('workflowStepReview')} />
      </Stepper>
      <div className="workflow-editor-stage">
        {step === 0 && (
          <TextInput
            label={t('catalogName')}
            value={value.name}
            isDisabled={disabled}
            onChange={(name) => onChange({ ...value, name })}
          />
        )}
        {step === 1 && (
          <WorkflowInputPicker
            value={value.item_ids}
            disabled={disabled}
            onChange={(item_ids) => onChange({ ...value, item_ids })}
          />
        )}
        {step === 2 && (
          <>
            <ProfilePicker
              disabled={disabled}
              onApply={(processing) => onChange({ ...value, processing: processing ?? null })}
            />
            <ProcessingOptions
              value={value.processing ?? undefined}
              disabled={disabled}
              onChange={(processing) => onChange({ ...value, processing: processing ?? null })}
            />
          </>
        )}
        {step === 3 && (
          <>
            <Text as="p" type="body" className="business-path">
              {value.output_name || t('batchNoFolder')}
            </Text>
            <Button label={t('batchChooseFolder')} isDisabled={disabled} onClick={onPickOutput} />
            <CheckboxInput
              label={t('catalogArchive')}
              value={value.archived}
              isDisabled={disabled}
              onChange={(archived) => onChange({ ...value, archived })}
            />
          </>
        )}
        {step === 4 && (
          <>
            <Text as="p" type="body">
              {t('workflowStepReviewInputs', { count: value.item_ids.length })}
            </Text>
            <Text as="p" type="body">
              {t('workflowStepReviewProcessing', {
                state: t(
                  value.processing
                    ? 'workflowStepReviewProcessingSet'
                    : 'workflowStepReviewProcessingUnset',
                ),
              })}
            </Text>
            <Text as="p" type="body">
              {t('workflowStepReviewOutput', {
                output: value.output_name || t('workflowStepReviewOutputMissing'),
              })}
            </Text>
            <div className="action-row">
              <Button
                label={t('catalogSave')}
                variant="primary"
                tooltip={missing.length ? missing.join(' · ') : undefined}
                isDisabled={saveDisabled}
                onClick={onSave}
              />
              <Button label={t('catalogReset')} isDisabled={disabled || !dirty} onClick={onReset} />
              {dirty && <Text type="supporting">{t('catalogUnsaved')}</Text>}
            </div>
            {saved && !dirty && (
              <Text as="p" type="body" role="status">
                {t('workflowSaved')}
              </Text>
            )}
          </>
        )}
      </div>
    </section>
  );
}
