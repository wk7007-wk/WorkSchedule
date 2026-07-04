import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const delivery = require('../docs/schedule_delivery_logic.js');
const attendanceBoardHynixLogicPath = '/root/my-first-project/AttendanceBoard/docs/hynix_schedule_logic.js';
const localHynixLogicPath = fileURLToPath(new URL('../docs/hynix_schedule_logic.js', import.meta.url));

function loadHynixScheduleLogic() {
  for (const candidate of [attendanceBoardHynixLogicPath, localHynixLogicPath]) {
    if (existsSync(candidate)) {
      return require(candidate);
    }
  }
  throw new Error(`Unable to locate hynix_schedule_logic.js in ${attendanceBoardHynixLogicPath} or ${localHynixLogicPath}`);
}

const hynixScheduleLogic = loadHynixScheduleLogic();

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

const staleFixed = { start: '08:00', end: '03:00', role: '주방,오토바이', kind: 'fixed', type: 'fixed' };
const gyuEmployee = { name: '이원규', short_name: '규', aliases: ['규'] };
const canonicalGyu = hynixScheduleLogic.canonicalFixedScheduleEntry('emp1', gyuEmployee, staleFixed);
assert.deepEqual(canonicalGyu, staleFixed);
assert.equal(hynixScheduleLogic.canonicalFixedScheduleEntry('emp1', gyuEmployee, null), null);
assert.deepEqual(hynixScheduleLogic.canonicalFixedScheduleEntry('emp2', { name: '권연옥', short_name: '권' }, staleFixed), staleFixed);

const canonicalGauge = gaugeRange([{ id: 'emp1', shift: canonicalGyu }]);
assert.equal(canonicalGauge.startMinute, operationalMinute('08:00'));
assert.equal(canonicalGauge.rangeMinutes, 19 * 60);

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

const appSource = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
assert.match(appSource, /최신 근무표/);
assert.match(appSource, /queueCompositeShare/);
assert.match(appSource, /navigator\.share|downloadCompositeImage/);
assert.match(appSource, /workschedule_delivery_cli_patch/);
assert.match(appSource, /get\('readonly'\)===?'1'/);
assert.match(appSource, /get\('testAuth'\)===?'1'/);
assert.match(appSource, /previewBanner/);
assert.match(appSource, /authModeBadge/);
assert.match(appSource, /PREVIEW_ONLY/);
assert.match(appSource, /function canonicalFixedSchedule\(empId\)/);
assert.match(appSource, /return S\.fix\[empId\]\|\|null/);
assert.match(appSource, /st==='clear'/);
assert.match(appSource, /publicManualCardModel/);
assert.match(indexSource, /근무 수정/);
assert.match(indexSource, /workEditBtn/);
assert.match(indexSource, /preview-banner/);
assert.match(indexSource, /authModeBadge/);
assert.doesNotMatch(appSource, /NativeBridge|shareImage|app\/src\/main\/assets/);
assert.doesNotMatch(appSource, /DFX/);
assert.doesNotMatch(appSource, new RegExp('최신' + ' 상태'));

const externalHynixIndexPath = '/root/my-first-project/AttendanceBoard/docs/hynix/index.html';
const externalHynixAppPath = '/root/my-first-project/AttendanceBoard/docs/hynix/app.js';

if (existsSync(externalHynixIndexPath) && existsSync(externalHynixAppPath)) {
  const hynixSource = readFileSync(externalHynixIndexPath, 'utf8');
  assert.match(hynixSource, /hynix_schedule_logic\.js/);
  assert.doesNotMatch(hynixSource, /17:00~06:00/);
  const hynixAppSource = readFileSync(externalHynixAppPath, 'utf8');
  assert.match(hynixAppSource, /window\.HynixScheduleLogic/);
  assert.match(hynixAppSource, /canonicalFixedScheduleEntry\(empId, emp, fixedEntry\)/);
  assert.match(hynixAppSource, /WORKSCHEDULE_BASE \+ '\/status'/);
} else {
  const localHynixSource = readFileSync(new URL('../docs/hynix_schedule_logic.js', import.meta.url), 'utf8');
  assert.match(localHynixSource, /canonicalFixedScheduleEntry\(empId, emp, fixed\)/);
  assert.doesNotMatch(localHynixSource, /isGyuEmployee/);
  const localAppSource = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
  assert.match(localAppSource, /function canonicalFixedSchedule\(empId\)/);
  assert.match(localAppSource, /return S\.fix\[empId\]\|\|null/);
}

console.log('schedule logic tests passed');
