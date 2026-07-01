import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

function fixedSchedule(empId) {
  const fixed = {
    emp1: { start: '17:00', end: '06:00', role: '주방,오토바이', kind: 'fixed', type: 'fixed' },
  };
  return fixed[empId] || null;
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

const gyu = fixedSchedule('emp1');
assert.equal(gyu.start, '17:00');
assert.equal(gyu.end, '06:00');

const rows = [
  { id: 'emp1', off: false, shift: { start: '17:00', end: '06:00' } },
  { id: 'emp2', off: true, shift: { start: '08:00', end: '09:00' } },
  { id: 'emp3', off: false, shift: null },
];
const dayWorkersOnly = gaugeRange(rows.filter((row) => !row.off && row.shift));
assert.deepEqual(dayWorkersOnly, overnight);

for (const file of ['docs/app.js', 'app/src/main/assets/app.js']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /이천시 부발읍/);
  assert.match(source, /17:00['"],\s*end:\s*['"]06:00/);
  if (file === 'docs/app.js') assert.match(source, /const DSH=6/);
  if (file.includes('assets')) assert.match(source, /const DAY_START_HOUR = 6/);
}

console.log('schedule logic tests passed');
