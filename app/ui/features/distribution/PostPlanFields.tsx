import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput';
import { Selector } from '@astryxdesign/core/Selector';
import { useTranslation } from 'react-i18next';
import { type PlanDraft, plannedCandidates } from '../../../core/distribution/post-schedule';
import { type CommandStatus, PanelRows, PanelSection } from '../../design-system/Panel';

const TIME_ZONES = (
  Intl as unknown as { supportedValuesOf(key: string): string[] }
).supportedValuesOf('timeZone');

export function PostPlanFields({
  value,
  onChange,
  disabled,
}: {
  value: PlanDraft;
  onChange(value: PlanDraft): void;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation();
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
  const status: CommandStatus | null = error
    ? { tone: 'error', text: t(error) }
    : value.enabled && value.instant
      ? {
          tone: 'neutral',
          text: t('postPlanInstant', {
            instant: new Date(Number(value.instant)).toLocaleString(i18n.language, {
              timeZone: value.timezone,
            }),
          }),
        }
      : null;
  return (
    <PanelSection
      title={t('postPlanEnable')}
      isOn={value.enabled}
      onToggle={(enabled) => onChange({ ...value, enabled })}
      isDisabled={disabled}
      status={status}
    >
      <PanelRows>
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
        <Selector
          label={t('postPlanZone')}
          value={value.timezone}
          isDisabled={disabled}
          hasSearch
          options={TIME_ZONES.map((zone) => ({ value: zone, label: zone }))}
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
              label: new Date(instant).toLocaleString(i18n.language, {
                timeZone: value.timezone,
              }),
            }))}
            onChange={(instant) => onChange({ ...value, instant })}
          />
        )}
      </PanelRows>
    </PanelSection>
  );
}
