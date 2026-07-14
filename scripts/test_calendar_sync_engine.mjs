import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadCalendarSyncConfig } from '../server/calendar_sync/config.mjs';
import { CalendarSyncEngine } from '../server/calendar_sync/engine.mjs';
import { MockCalendarProvider } from '../server/calendar_sync/mock_provider.mjs';
import { MemorySyncStore } from '../server/calendar_sync/store.mjs';
import { RetryableProviderError } from '../server/calendar_sync/errors.mjs';

const require = createRequire(import.meta.url);
const core = require('../docs/calendar_core_logic.js');

function config(overrides = {}) {
  return Object.assign(loadCalendarSyncConfig({
    WORKSCHEDULE_CALENDAR_PROVIDER: 'mock',
    WORKSCHEDULE_CALENDAR_SYNC_ENABLED: 'true',
    WORKSCHEDULE_CALENDAR_KILL_SWITCH: 'false',
    WORKSCHEDULE_CALENDAR_HORIZON_DAYS: '2'
  }), overrides);
}

const baseSnapshot = {
  employees: { emp1: { name: '이원규', active: true }, emp2: { name: '권연옥', active: true } },
  fixed_schedules: {},
  overrides: {
    '2026-07-14': {
      emp1: {
        state: 'shift', type: 'manual_shift', shift: { start: '10:00', end: '18:00', role: '주방' },
        start: '10:00', end: '18:00', role: '주방', updated_at_ms: 100
      }
    }
  },
  status: { '2026-07-14': { emp1: { status: 'confirmed' } } },
  attendance: { '2026-07-14': { emp1: { actual_start: '10:01', actual_end: '18:02' } } }
};

let nowMs = Date.parse('2026-07-14T03:00:00Z');
const clock = () => nowMs;
const store = new MemorySyncStore(baseSnapshot);
const provider = new MockCalendarProvider({ pageSize: 1, clock });
const engine = new CalendarSyncEngine({ config: config(), store, provider, clock, sleep: async () => {} });

const item = core.buildOutboxItem({
  entity: 'daily_override', date: '2026-07-14', employeeId: 'emp1',
  row: baseSnapshot.overrides['2026-07-14'].emp1, nowMs
});
await store.enqueueOutbox(item);
const pushed = await engine.processOutbox();
assert.equal(pushed.processed, 1);
assert.equal(pushed.results[0].ok, true);
assert.equal(provider.events.size, 1);
const created = Array.from(provider.events.values())[0];
assert.equal(created.extendedProperties.private.wsCanonicalKey, 'daily|2026-07-14|emp1');
assert.equal(created.extendedProperties.private.wsEmployeeId, 'emp1');
assert.equal(created.start.dateTime, '2026-07-14T10:00:00+09:00');
assert.equal((await engine.processOutbox()).processed, 0, 'idempotent outbox must not duplicate events');

await provider.simulateExternalEdit(created.id, {
  start: { dateTime: '2026-07-14T11:00:00+09:00', timeZone: 'Asia/Seoul' },
  end: { dateTime: '2026-07-14T19:00:00+09:00', timeZone: 'Asia/Seoul' }
});
const firstPull = await engine.pullChanges({ reason: 'test_initial' });
assert.equal(firstPull.mode, 'full');
assert.equal(store.snapshot.overrides['2026-07-14'].emp1.start, '11:00');
assert.equal(store.snapshot.overrides['2026-07-14'].emp1.end, '19:00');
assert.deepEqual(store.snapshot.attendance, baseSnapshot.attendance, 'calendar import must never mutate attendance');

const mappingAfterEdit = await store.getMapping('daily|2026-07-14|emp1');
await provider.simulateExternalEdit(mappingAfterEdit.eventId, { status: 'cancelled', deleted: true });
const deletePull = await engine.pullChanges({ reason: 'test_delete' });
assert.equal(deletePull.mode, 'incremental');
assert.equal(store.snapshot.overrides['2026-07-14'].emp1.state, 'clear');
assert.equal(store.snapshot.status['2026-07-14'].emp1.state, 'clear');
assert.deepEqual(store.snapshot.attendance, baseSnapshot.attendance);

const tokenBeforeGone = (await store.getSyncState()).sync_token;
provider.invalidateSyncToken(tokenBeforeGone);
const recovered = await engine.pullChanges({ reason: 'test_410' });
assert.equal(recovered.recoveredFromGone, true);
assert.equal(recovered.mode, 'full');
assert.ok((await store.getSyncState()).sync_token);

const listCalls = provider.calls.filter(call => call.method === 'listEventsPage');
for (let index = 1; index < listCalls.length; index += 1) {
  assert.deepEqual(listCalls[index].queryParams, listCalls[0].queryParams, 'every page/full/incremental query must keep the same base parameters');
}

const conflictMapping = await store.getMapping('daily|2026-07-14|emp1');
store.snapshot.overrides['2026-07-14'].emp1 = {
  state: 'shift', shift: { start: '12:00', end: '20:00', role: '주방' }, start: '12:00', end: '20:00', role: '주방', updated_at_ms: nowMs + 100
};
await provider.simulateExternalEdit(conflictMapping.eventId, {
  status: 'confirmed',
  start: { dateTime: '2026-07-14T13:00:00+09:00', timeZone: 'Asia/Seoul' },
  end: { dateTime: '2026-07-14T21:00:00+09:00', timeZone: 'Asia/Seoul' }
});
await engine.pullChanges({ reason: 'test_conflict' });
assert.equal(store.snapshot.overrides['2026-07-14'].emp1.start, '12:00', 'etag+revision conflict must not overwrite canonical data');
assert.ok(Object.keys(store.meta.conflicts).length >= 1);

class FlakyMockProvider extends MockCalendarProvider {
  constructor(options) { super(options); this.failures = 1; }
  async insertEvent(event) {
    if (this.failures-- > 0) throw new RetryableProviderError('temporary', { status: 503 });
    return await super.insertEvent(event);
  }
}
const retryStore = new MemorySyncStore(baseSnapshot);
const retryProvider = new FlakyMockProvider({ clock });
const retryEngine = new CalendarSyncEngine({ config: config(), store: retryStore, provider: retryProvider, clock, sleep: async () => {} });
await retryStore.enqueueOutbox(item);
assert.equal((await retryEngine.processOutbox()).results[0].ok, true);
assert.equal(retryProvider.events.size, 1);
assert.ok(Object.values(retryStore.meta.audits).some(row => row.action === 'provider_retry'));

const killedStore = new MemorySyncStore(baseSnapshot);
await killedStore.enqueueOutbox(item);
const killed = new CalendarSyncEngine({ config: config({ killSwitch: true }), store: killedStore, provider: new MockCalendarProvider({ clock }), clock, sleep: async () => {} });
await assert.rejects(() => killed.processOutbox(), error => error && error.code === 'kill_switch');
assert.equal((await killedStore.listPendingOutbox()).length, 1, 'kill switch must leave canonical outbox pending and untouched');

const channel = { id: 'channel-1', resourceId: 'resource-1', token: 'secret-token', expirationMs: nowMs + 60000 };
await store.setChannel(channel);
assert.equal((await engine.acceptWebhook({
  'x-goog-channel-id': channel.id,
  'x-goog-resource-id': channel.resourceId,
  'x-goog-channel-token': channel.token,
  'x-goog-resource-state': 'exists',
  'x-goog-message-number': '10'
})).accepted, true);
assert.equal(Object.keys(store.meta.pull_signals).length, 1, 'webhook only queues an incremental pull signal');
assert.equal((await engine.acceptWebhook({
  'x-goog-channel-id': channel.id,
  'x-goog-resource-id': channel.resourceId,
  'x-goog-channel-token': 'wrong'
})).status, 403);

console.log('calendar sync engine ok');
