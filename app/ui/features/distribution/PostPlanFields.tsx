import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useTranslation } from 'react-i18next';
import { type PlanDraft, plannedCandidates } from '../../../core/distribution/post-schedule';

export function PostPlanFields({
  value,
  onChange,
  disabled,
}: {
  value: PlanDraft;
  onChange(value: PlanDraft): void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  let candidates: number[] = [];
  let error = '';
  if (value.enabled && value.local) {
    try {
      candidates = plannedCandidates(value.local, value.timezone);
      if (!candidates.length) error = 'postPlanGap';
    } catch {
      error = 'postPlanInvalid';
    }
  }
  function change(next: PlanDraft) {
    try {
      const matches = plannedCandidates(next.local, next.timezone);
      onChange({ ...next, instant: matches.length === 1 ? String(matches[0]) : '' });
    } catch {
      onChange({ ...next, instant: '' });
    }
  }
  return (
    <VStack gap={3}>
      <CheckboxInput
        label={t('postPlanEnable')}
        value={value.enabled}
        isDisabled={disabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      {value.enabled && (
        <>
          <DateTimeInput
            label={t('postPlanTime')}
            timeLabel={t('postPlanClock')}
            placeholder={t('postPlanDatePlaceholder')}
            timePlaceholder={t('postPlanTimePlaceholder')}
            hourFormat="24h"
            hasSeconds
            hasClear
            value={(value.local || undefined) as ISODateTimeString | undefined}
            isDisabled={disabled}
            onChange={(local) => change({ ...value, local: local ?? '' })}
          />
          <TextInput
            label={t('postPlanZone')}
            value={value.timezone}
            isDisabled={disabled}
            onChange={(timezone) => change({ ...value, timezone })}
          />
          {candidates.length > 1 && (
            <Selector
              label={t('postPlanOccurrence')}
              value={value.instant}
              placeholder={t('postPlanChooseOccurrence')}
              isDisabled={disabled}
              options={candidates.map((instant) => ({
                value: String(instant),
                label: new Date(instant).toISOString(),
              }))}
              onChange={(instant) => onChange({ ...value, instant })}
            />
          )}
          {error && (
            <Text as="p" type="body" className="inline-error" role="alert">
              {t(error)}
            </Text>
          )}
          {value.instant && !error && (
            <Text as="p" type="body">
              {t('postPlanInstant', { instant: new Date(Number(value.instant)).toISOString() })}
            </Text>
          )}
          <Text as="p" type="supporting">
            {t('postPlanHelp')}
          </Text>
        </>
      )}
    </VStack>
  );
}
