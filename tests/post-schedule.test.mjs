import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPlannedTime,
  plannedCandidates,
  readPlanDraft,
} from '../dist-core/distribution/post-schedule.js';

test('planned wall time uses the chosen timezone, not UI locale or machine zone', () => {
  const [instant] = plannedCandidates('2026-09-16T10:30:00', 'Asia/Bangkok');
  assert.equal(new Date(instant).toISOString(), '2026-09-16T03:30:00.000Z');
  assert.equal(formatPlannedTime(instant, 'Asia/Bangkok'), '2026-09-16T10:30:00');
  assert.equal(
    new Date(plannedCandidates('2026-09-16T10:30', 'Asia/Kathmandu')[0]).toISOString(),
    '2026-09-16T04:45:00.000Z',
  );
});

test('nonexistent and repeated daylight-saving hours are never chosen silently', () => {
  assert.deepEqual(plannedCandidates('2026-03-08T02:30:00', 'America/New_York'), []);
  const values = plannedCandidates('2026-11-01T01:30:00', 'America/New_York');
  assert.deepEqual(
    values.map((value) => new Date(value).toISOString()),
    ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'],
  );
  assert.throws(
    () =>
      readPlanDraft({
        enabled: true,
        local: '2026-11-01T01:30:00',
        timezone: 'America/New_York',
        instant: '',
      }),
    /INVALID_PLAN/,
  );
});

test('invalid dates, zones and forged local/instant pairs fail closed', () => {
  for (const value of ['2026-02-30T10:00', '2026-09-16T24:30', 'today', '1969-12-30T12:00']) {
    assert.throws(() => plannedCandidates(value, 'UTC'), /INVALID_PLAN_TIME/);
  }
  assert.throws(() => plannedCandidates('2026-09-16T12:00', 'Unknown/Zone'), /INVALID_PLAN_ZONE/);
  assert.throws(
    () =>
      readPlanDraft({ enabled: true, local: '2026-09-16T12:00', timezone: 'UTC', instant: '1' }),
    /INVALID_PLAN_TIME/,
  );
});

test('unchanged drafts preserve exact stored milliseconds and optional plans remain optional', () => {
  const instant = Date.parse('2026-09-16T10:30:05.123Z');
  const draft = {
    enabled: true,
    local: '2026-09-16T10:30:05',
    timezone: 'UTC',
    instant: String(instant),
  };
  assert.deepEqual(readPlanDraft(draft), { instant, timezone: 'UTC' });
  assert.equal(readPlanDraft({ ...draft, enabled: false }), null);
});
