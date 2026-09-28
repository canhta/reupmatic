import { object, text } from '../catalog/validation.js';
import type { PostPlan } from './distribution-contracts.js';

export interface PlanDraft {
  enabled: boolean;
  local: string;
  timezone: string;
  instant: string;
}

export function parsePostPlan(input: unknown): PostPlan | null {
  if (input === null) return null;
  const value = object(input, ['instant', 'timezone']);
  if (
    !Number.isSafeInteger(value.instant) ||
    Number(value.instant) < 0 ||
    Number(value.instant) > 8640000000000000
  ) {
    throw new Error('INVALID_SCHEDULE');
  }
  const timezone = text(value.timezone, 100);
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(Number(value.instant));
  } catch {
    throw new Error('INVALID_SCHEDULE');
  }
  return { instant: Number(value.instant), timezone };
}

function formatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function wallTime(instant: number, format: Intl.DateTimeFormat): string {
  const parts = Object.fromEntries(
    format.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatPlannedTime(instant: number, timezone: string): string {
  return wallTime(instant, formatter(timezone));
}

export function plannedCandidates(local: string, timezone: string): number[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) throw new Error('INVALID_PLAN_TIME');
  const normalized = local.length === 16 ? `${local}:00` : local;
  const naive = Date.parse(`${normalized}Z`);
  if (
    !Number.isFinite(naive) ||
    naive < 0 ||
    new Date(naive).toISOString().slice(0, 19) !== normalized
  ) {
    throw new Error('INVALID_PLAN_TIME');
  }
  let format: Intl.DateTimeFormat;
  try {
    format = formatter(timezone);
  } catch {
    throw new Error('INVALID_PLAN_ZONE');
  }
  const offsets = new Set<number>();
  const hour = 3_600_000;
  for (let shift = -48; shift <= 48; shift += 6) {
    const sample = naive + shift * hour;
    offsets.add(Date.parse(`${wallTime(sample, format)}Z`) - sample);
  }
  return [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => instant >= 0 && wallTime(instant, format) === normalized)
    .sort((a, b) => a - b);
}

export function readPlanDraft(draft: PlanDraft): { instant: number; timezone: string } | null {
  if (!draft.enabled) return null;
  const instant = Number(draft.instant);
  if (!draft.instant || !Number.isSafeInteger(instant) || instant < 0)
    throw new Error('INVALID_PLAN_TIME');
  const local = draft.local.length === 16 ? `${draft.local}:00` : draft.local;
  if (formatPlannedTime(instant, draft.timezone) !== local) throw new Error('INVALID_PLAN_TIME');
  return { instant, timezone: draft.timezone };
}
