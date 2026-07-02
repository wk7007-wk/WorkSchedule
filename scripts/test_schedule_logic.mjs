import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const delivery = require('../docs/schedule_delivery_logic.js');

const DAY_START_HOUR = 6;
const DAY_MINUTES = 24 * 60;

function operationalMinute(time) {
  const [hour, minute] = time.split(':').map(Number);
  let normalizedHour = hour;
  if (normalizedHour < DAY_START_HOUR) normalizedHour += 24;
  return normalizedHour * 60 + minute;
}

function shiftSpan(start, end) {
  const spanStart = operationalMinute(start);
  let spanEnd = operationalMinute(end);
  if (spanEnd <= spanStart) spanEnd += DAY_MINUTES;
  return { start: spanStart, end: spanEnd };
}

function calcHours(start, end) {
  const span = shiftSpan(start, end);
  return Math.round(((span.end - span.start) / 60) * 10) / 10;
}

function gaugeRange(working) {
  if (!working.length) {
    return { startMinute: DAY_START_HOUR * 60, rangeMinutes: 12 * 60 };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const row of working) {
    const span = shiftSpan(row.shift.start, row.shift.end);
    min = Math.min(min, span.start);
    max = Math.max(max, span.end);
  }
  return { startMinute: min, rangeMinutes: max - min };
}

const mixedDay = gaugeRange([
  { id: 'emp2', shift: { start: '10:00', end: '18:00' } },
  { id: 'emp1', shift: { start: '17:00', end: '06:00' } },
]);
assert.equal(mixedDay.startMinute, operationalMinute('10:00'));
assert.equal(mixedDay.rangeMinutes, operationalMinute('06:00') + DAY_MINUTES - operationalMinute('10:00'));

const overnight = gaugeRange([{ id: 'emp1', shift: { start: '17:00', end: '06:00' } }]);
assert.equal(overnight.startMinute, operationalMinute('17:00'));
assert.equal(overnight.rangeMinutes, 13 * 60);
assert.equal(calcHours('17:00', '06:00'), 13);

const rows = [
  { id: 'emp1', off: false, shift: { start: '17:00', end: '06:00' } },
  { id: 'emp2', off: true, shift: { start: '08:00', end: '09:00' } },
  { id: 'emp3', off: false, shift: null },
];
assert.deepEqual(gaugeRange(rows.filter((row) => !row.off && row.shift)), overnight);

let state = delivery.markScheduleChanged({}, 0);
assert.equal(delivery.computeDeliveryState({ ...state, nowMs: delivery.IDLE_MS - 1 }).idleDue, false);
assert.equal(delivery.computeDeliveryState({ ...state, nowMs: delivery.IDLE_MS }).idleDue, true);

state = delivery.markScheduleChanged(state, 120_000);
assert.equal(delivery.computeDeliveryState({ ...state, nowMs: delivery.IDLE_MS + 119_999 }).idleDue, false);
assert.equal(delivery.computeDeliveryState({ ...state, nowMs: delivery.IDLE_MS + 120_000 }).idleDue, true);

let sentState = delivery.markShareIntentQueued(state, delivery.IDLE_MS + 120_000);
let periodic = delivery.computeDeliveryState({ ...sentState, nowMs: sentState.lastSentAtMs + delivery.PERIODIC_MS - 1 });
assert.equal(periodic.periodicDue, false);
periodic = delivery.computeDeliveryState({ ...sentState, nowMs: sentState.lastSentAtMs + delivery.PERIODIC_MS });
assert.equal(periodic.periodicDue, true);
assert.equal(periodic.targetKind, 'latest_work_schedule');

sentState = delivery.markShareIntentQueued(sentState, sentState.lastSentAtMs + delivery.PERIODIC_MS);
const nextPeriodic = delivery.computeDeliveryState({ ...sentState, nowMs: sentState.lastSentAtMs + 1 });
assert.equal(nextPeriodic.nextDueAtMs, sentState.lastSentAtMs + delivery.PERIODIC_MS);
assert.equal(nextPeriodic.targetKind, 'latest_work_schedule');

for (const file of ['docs/app.js', 'app/src/main/assets/app.js']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /최신 근무표/);
  assert.match(source, /queueCompositeShare/);
  assert.match(source, /shareImage/);
  assert.match(source, /workschedule_delivery_cli_patch/);
  assert.doesNotMatch(source, new RegExp('최신' + ' 상태'));
}

console.log('schedule logic tests passed');
