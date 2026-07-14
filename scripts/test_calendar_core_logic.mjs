import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../docs/calendar_core_logic.js');
const view = require('../docs/calendar_view_logic.js');

assert.deepEqual(core.rangeForView('2026-07-14', 'day'), ['2026-07-14']);
assert.deepEqual(core.rangeForView('2026-07-14', 'week'), [
  '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'
]);
assert.equal(core.rangeForView('2026-07-14', 'month').length, 42);

const employeeOrder = ['emp1', 'emp2', 'emp3', 'emp4'];
const shifts = {
  emp1: { start: '10:00', end: '18:00' },
  emp2: { start: '10:00', end: '17:00' },
  emp3: { start: '08:30', end: '12:00' }
};
assert.deepEqual(core.sortEmployeeIdsForDate(employeeOrder, id => shifts[id] || null), ['emp3', 'emp1', 'emp2', 'emp4']);

const events = [
  core.eventFromSchedule({ date: '2026-07-14', employeeId: 'emp1', employee: { name: 'A' }, shift: { start: '10:00', end: '18:00' } }),
  core.eventFromSchedule({ date: '2026-07-14', employeeId: 'emp2', employee: { name: 'B' }, shift: { start: '11:00', end: '15:00' } }),
  core.eventFromSchedule({ date: '2026-07-14', employeeId: 'emp3', employee: { name: 'C' }, shift: { start: '12:00', end: '14:00' } })
];
const overlap = core.computeOverlap(events);
assert.equal(overlap.maxCount, 3);
assert.ok(overlap.segments.some(segment => segment.count === 3 && segment.startMin === 12 * 60 && segment.endMin === 14 * 60));

assert.equal(core.classifyShiftLight({ start: '09:00', end: '17:00' }, { sunrise: '06:10', sunset: '18:50' }).kind, 'light');
assert.equal(core.classifyShiftLight({ start: '20:00', end: '03:00' }, { sunrise: '06:10', sunset: '18:50' }).kind, 'dark');
assert.equal(core.classifyShiftLight({ start: '17:00', end: '22:00' }, { sunrise: '06:10', sunset: '18:50' }).kind, 'mixed');
assert.match(core.buildDayGradient({ sunrise: '06:10', sunset: '18:50' }), /^linear-gradient/);

const permanent = core.buildPermanentFixedSchedule({
  start: '09:00', end: '17:00', role: '', off: [], days: [], zero_value: 0,
  dayTimes: { mon: { start: '', end: '', role: '' } }, expires_at_ms: 123, validUntil: '2026-08-01', custom: { empty: [] }
}, { start: '10:00', end: '18:00', role: '' }, { nowMs: 1000 });
assert.equal(permanent.start, '10:00');
assert.equal(permanent.end, '18:00');
assert.equal(permanent.role, '');
assert.deepEqual(permanent.off, []);
assert.deepEqual(permanent.days, []);
assert.equal(permanent.zero_value, 0);
assert.deepEqual(permanent.dayTimes, { mon: { start: '', end: '', role: '' } });
assert.deepEqual(permanent.custom.empty, []);
assert.equal(permanent.permanent, true);
assert.equal('expires_at_ms' in permanent, false);
assert.equal('validUntil' in permanent, false);

const overlay = {
  source: 'kma_cache', provider_mode: 'live', fetched_at_ms: 0, expires_at_ms: 2000,
  weather: { precipitation_mm: 0, precipitation_probability_pct: 0, humidity_pct: 0 },
  holiday: null, sunrise: '06:00', sunset: '19:00'
};
const merged = core.mergeCoreOverlay({ events: [], headcount: 0 }, overlay);
assert.deepEqual(merged.core.events, []);
assert.equal(merged.core.headcount, 0);
assert.equal(merged.overlay.weather.precipitation_mm, 0);
assert.equal(core.overlayFreshness(overlay, 1500).stale, false);
assert.equal(core.overlayFreshness(overlay, 2500).stale, true);
assert.equal(core.overlayFreshness(overlay, 1500).fetchedAtMs, 0);

const outbox = core.buildOutboxItem({
  entity: 'daily_override', date: '2026-07-14', employeeId: 'emp1',
  row: { state: 'shift', updated_at_ms: 0 }, nowMs: 999
});
assert.equal(outbox.canonical_root, '/workschedule_v2');
assert.equal(outbox.metadata_root, core.CALENDAR_NAMESPACE.syncMetadataRoot);
assert.equal(outbox.canonical_revision, '0');
assert.doesNotMatch(outbox.id, /[.#$\[\]\/]/);

let releaseOutbox;
const queued = new Promise(resolve => { releaseOutbox = resolve; });
const saveResult = await core.saveCoreThenQueue(
  async () => ({ canonicalSaved: true }),
  async () => { await queued; return true; },
  outbox
);
assert.equal(saveResult.coreSaved, true);
assert.equal(saveResult.outboxScheduled, true);
assert.equal(saveResult.coreResult.canonicalSaved, true);
let settled = false;
saveResult.outboxPromise.then(() => { settled = true; });
await Promise.resolve();
assert.equal(settled, false, 'outbox must not block the canonical save result');
releaseOutbox();
assert.equal((await saveResult.outboxPromise).ok, true);

const firebaseVoidResult = await core.saveCoreThenQueue(
  async () => undefined,
  async () => undefined,
  outbox
);
assert.equal(firebaseVoidResult.coreSaved, true, 'Firebase void canonical write is success');
assert.equal((await firebaseVoidResult.outboxPromise).ok, true, 'Firebase void outbox write is success');
assert.equal((await core.saveCoreThenQueue(async () => false, async () => true, outbox)).coreSaved, false);
const thrownCore = await core.saveCoreThenQueue(async () => { throw new Error('write rejected'); }, async () => true, outbox);
assert.equal(thrownCore.coreSaved, false);
assert.equal(thrownCore.outboxScheduled, false);
assert.match(thrownCore.coreError, /write rejected/);

const model = view.buildCalendarModel({
  anchor: '2026-07-14', view: 'week', nowMs: 1500,
  employees: { emp1: { name: 'A' }, emp2: { name: 'B' }, emp3: { name: 'C' } },
  employeeIds: ['emp1', 'emp2', 'emp3'],
  overlays: { '2026-07-14': overlay },
  resolveShift: (date, id) => date === '2026-07-14' ? shifts[id] || null : null,
  resolveOff: () => false,
  resolveStatus: () => 'confirmed'
});
assert.equal(model.days.length, 7);
assert.deepEqual(model.days.find(day => day.date === '2026-07-14').employeeIds, ['emp3', 'emp1', 'emp2']);
const markup = view.renderCalendarMarkup(model);
assert.match(markup, /data-calendar-slot-date="2026-07-14"/);
assert.match(markup, /동시 최대/);
assert.match(markup, /강수 0mm/);
assert.doesNotMatch(markup, /undefined/);

console.log('calendar core logic ok');
