import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadCalendarSyncConfig } from '../server/calendar_sync/config.mjs';
import { CalendarSyncEngine } from '../server/calendar_sync/engine.mjs';
import { MockCalendarProvider } from '../server/calendar_sync/mock_provider.mjs';
import { MemorySyncStore } from '../server/calendar_sync/store.mjs';
import { RetryableProviderError } from '../server/calendar_sync/errors.mjs';
import {
  canonicalKey,
  googleEventToCanonical,
  projectCanonicalToGoogleEvent,
  revisionOf
} from '../server/calendar_sync/domain.mjs';

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

const leaseBudgetConfig = config();
assert.ok(leaseBudgetConfig.outboxLeaseMs > leaseBudgetConfig.outboxOperationWindowMs);
assert.ok(leaseBudgetConfig.outboxLeaseMs > leaseBudgetConfig.providerAttemptTimeoutMs + Math.max(...leaseBudgetConfig.retryBackoffMs));

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
assert.match(created.id, /^[0-9a-v]{5,1024}$/, 'caller-supplied event ID must meet Google base32hex constraints');
assert.equal(created.extendedProperties.private.wsCanonicalKey, 'daily|2026-07-14|emp1');
assert.equal(created.extendedProperties.private.wsEmployeeId, 'emp1');
assert.equal(created.start.dateTime, '2026-07-14T10:00:00+09:00');
assert.equal((await engine.processOutbox()).processed, 0, 'idempotent outbox must not duplicate events');

const overnightEntity = {
  canonicalKey: canonicalKey('2026-07-14', 'emp1'), mappingId: 'mapping-night', date: '2026-07-14',
  employeeId: 'emp1', employee: baseSnapshot.employees.emp1, state: 'shift',
  shift: { start: '02:00', end: '05:00', role: '야간' }, revision: 'night-1'
};
const overnightProjection = projectCanonicalToGoogleEvent(overnightEntity, { operationalDayStartMin: 360, timeZone: 'Asia/Seoul' });
assert.equal(overnightProjection.start.dateTime, '2026-07-15T02:00:00+09:00');
const overnightRoundTrip = googleEventToCanonical(Object.assign({ id: 'night-event', etag: 'night-etag' }, overnightProjection), {
  employees: baseSnapshot.employees, operationalDayStartMin: 360, timeZone: 'Asia/Seoul'
});
assert.equal(overnightRoundTrip.date, '2026-07-14', '02:00 belongs to the prior operational day');
assert.equal(overnightRoundTrip.row.end, '05:00');
const allDayOff = googleEventToCanonical({
  id: 'off-event', summary: '휴무 · 이원규', start: { date: '2026-07-15' }, end: { date: '2026-07-16' },
  extendedProperties: { private: { wsEmployeeId: 'emp1', wsState: 'off' } }
}, { employees: baseSnapshot.employees, operationalDayStartMin: 360 });
assert.equal(allDayOff.date, '2026-07-15', 'all-day off keeps its literal date');

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

const sharedStore = new MemorySyncStore(baseSnapshot);
const sharedProvider = new MockCalendarProvider({ clock });
await sharedStore.enqueueOutbox(item);
const engineA = new CalendarSyncEngine({ config: config(), store: sharedStore, provider: sharedProvider, clock, sleep: async () => {}, workerId: 'worker-a' });
const engineB = new CalendarSyncEngine({ config: config(), store: sharedStore, provider: sharedProvider, clock, sleep: async () => {}, workerId: 'worker-b' });
const concurrent = await Promise.all([engineA.processOutbox(), engineB.processOutbox()]);
assert.equal(concurrent.reduce((sum, result) => sum + result.processed, 0), 1, 'only one worker may claim one outbox row');
assert.equal(sharedProvider.events.size, 1, 'concurrent workers must create exactly one Google event');

class LostInsertResponseProvider extends MockCalendarProvider {
  constructor(options) { super(options); this.loseResponse = true; }
  async insertEvent(event) {
    const created = await super.insertEvent(event);
    if (this.loseResponse) {
      this.loseResponse = false;
      throw new RetryableProviderError('response lost after remote commit', { status: 503 });
    }
    return created;
  }
}
const lostStore = new MemorySyncStore(baseSnapshot);
const lostProvider = new LostInsertResponseProvider({ clock });
await lostStore.enqueueOutbox(item);
const lostEngine = new CalendarSyncEngine({ config: config(), store: lostStore, provider: lostProvider, clock, sleep: async () => {}, workerId: 'lost-worker' });
assert.equal((await lostEngine.processOutbox()).results[0].ok, true);
assert.equal(lostProvider.events.size, 1, 'retry after an ambiguous insert must recover the deterministic event');
assert.equal(lostProvider.calls.filter(call => call.method === 'insertEvent').length, 1);

const leaseStore = new MemorySyncStore(baseSnapshot);
await leaseStore.enqueueOutbox(item);
const firstLease = (await leaseStore.claimOutbox({ nowMs, leaseMs: 100, ownerId: 'old-worker' }))[0];
assert.equal((await leaseStore.claimOutbox({ nowMs: nowMs + 99, leaseMs: 100, ownerId: 'new-worker' })).length, 0);
const recoveredLease = (await leaseStore.claimOutbox({ nowMs: nowMs + 100, leaseMs: 100, ownerId: 'new-worker' }))[0];
assert.equal(recoveredLease.lease_epoch, firstLease.lease_epoch + 1, 'expired lease increments the fence epoch');
assert.equal(await leaseStore.finishOutbox(item.id, firstLease, { status: 'done' }), null, 'stale worker cannot complete a reclaimed row');
assert.ok(await leaseStore.finishOutbox(item.id, recoveredLease, { status: 'done' }));

function moveEvent(etag = '"move-new"') {
  return {
    id: 'move-event', etag, status: 'confirmed', summary: '이원규 · 주방',
    start: { dateTime: '2026-07-15T10:00:00+09:00', timeZone: 'Asia/Seoul' },
    end: { dateTime: '2026-07-15T18:00:00+09:00', timeZone: 'Asia/Seoul' },
    extendedProperties: { private: {
      wsCanonicalKey: 'daily|2026-07-14|emp1', wsEmployeeId: 'emp1', wsMappingId: 'move-map', wsRole: '주방'
    } }
  };
}

const occupiedSnapshot = structuredClone(baseSnapshot);
occupiedSnapshot.overrides['2026-07-15'] = {
  emp1: { state: 'shift', start: '08:00', end: '16:00', shift: { start: '08:00', end: '16:00', role: '홀' }, updated_at_ms: 777 }
};
const occupiedStore = new MemorySyncStore(occupiedSnapshot);
await occupiedStore.setMapping('daily|2026-07-14|emp1', {
  mappingId: 'move-map', eventId: 'move-event', googleEtag: '"move-old"',
  canonicalRevision: revisionOf(occupiedSnapshot.overrides['2026-07-14'].emp1), employeeId: 'emp1', date: '2026-07-14'
});
const occupiedEngine = new CalendarSyncEngine({ config: config(), store: occupiedStore, provider: new MockCalendarProvider({ clock }), clock, workerId: 'move-worker' });
const occupiedResult = await occupiedEngine.applyGoogleEvent(moveEvent(), await occupiedStore.getSnapshot());
assert.equal(occupiedResult.reason, 'move_destination_occupied');
assert.equal(occupiedStore.snapshot.overrides['2026-07-15'].emp1.start, '08:00', 'unrelated destination override is never overwritten');
assert.equal(occupiedStore.snapshot.overrides['2026-07-14'].emp1.start, '10:00', 'source remains intact on destination conflict');

const fixedDestinationSnapshot = structuredClone(baseSnapshot);
fixedDestinationSnapshot.fixed_schedules.emp1 = { kind: 'weekly', days: ['wed'], start: '09:00', end: '17:00', role: '고정', updated_at_ms: 50 };
const fixedDestinationStore = new MemorySyncStore(fixedDestinationSnapshot);
await fixedDestinationStore.setMapping('daily|2026-07-14|emp1', {
  mappingId: 'move-map', eventId: 'move-event', googleEtag: '"move-old"',
  canonicalRevision: revisionOf(fixedDestinationSnapshot.overrides['2026-07-14'].emp1), employeeId: 'emp1', date: '2026-07-14'
});
const fixedDestinationEngine = new CalendarSyncEngine({ config: config(), store: fixedDestinationStore, provider: new MockCalendarProvider({ clock }), clock, workerId: 'fixed-move-worker' });
assert.equal((await fixedDestinationEngine.applyGoogleEvent(moveEvent(), await fixedDestinationStore.getSnapshot())).status, 'imported');
assert.equal(fixedDestinationStore.snapshot.overrides['2026-07-15'].emp1.google_event_id, 'move-event', 'fixed schedule alone does not block a move');
assert.equal(fixedDestinationStore.snapshot.overrides['2026-07-14'].emp1.state, 'clear');
const repeatedMove = moveEvent('"move-newer"');
assert.equal((await fixedDestinationEngine.applyGoogleEvent(repeatedMove, await fixedDestinationStore.getSnapshot())).status, 'imported');
assert.equal(fixedDestinationStore.snapshot.overrides['2026-07-15'].emp1.google_event_id, 'move-event', 'same event can be applied idempotently');

const sourceRaceStore = new MemorySyncStore(baseSnapshot);
const sourceRaceRevision = await sourceRaceStore.getCanonicalRevision('daily|2026-07-14|emp1');
const sourceRaceExpectation = await sourceRaceStore.getExplicitOverrideState('2026-07-14', 'emp1');
const sourceRaceDestination = await sourceRaceStore.getExplicitOverrideState('2026-07-15', 'emp1');
sourceRaceStore.snapshot.overrides['2026-07-14'].emp1 = Object.assign(
  {}, sourceRaceStore.snapshot.overrides['2026-07-14'].emp1, { start: '11:00', updated_at_ms: 101 }
);
await assert.rejects(
  () => sourceRaceStore.writeImportedMoveAtomic({
    action: 'move', date: '2026-07-15', priorDate: '2026-07-14', employeeId: 'emp1',
    row: { state: 'shift', start: '10:00', end: '18:00', google_event_id: 'race-event', google_etag: '"race"' }
  }, {
    nowMs, sourceExpectedRevision: sourceRaceRevision,
    sourceExpectation: sourceRaceExpectation, destinationExpectation: sourceRaceDestination
  }),
  error => error && error.code === 'move_source_changed'
);
assert.equal(sourceRaceStore.snapshot.overrides['2026-07-14'].emp1.start, '11:00');
assert.equal(sourceRaceStore.snapshot.overrides['2026-07-15'], undefined, 'Memory atomic move mutates neither side after a source race');

let fenceNow = 1000;
let releaseOldRead;
let signalOldRead;
const oldReadReached = new Promise(resolve => { signalOldRead = resolve; });
const oldReadRelease = new Promise(resolve => { releaseOldRead = resolve; });
class PausingBeforeInsertProvider extends MockCalendarProvider {
  constructor(options) { super(options); this.pauseOnce = true; }
  async getEvent(eventId) {
    const value = await super.getEvent(eventId);
    if (this.pauseOnce) {
      this.pauseOnce = false;
      signalOldRead();
      await oldReadRelease;
    }
    return value;
  }
}
const fencedStore = new MemorySyncStore(baseSnapshot);
const fencedProvider = new PausingBeforeInsertProvider({ clock: () => fenceNow });
const fencedItem = Object.assign({}, item, { created_at_ms: fenceNow, next_attempt_at_ms: fenceNow });
await fencedStore.enqueueOutbox(fencedItem);
const shortLeaseConfig = config({ outboxLeaseMs: 100 });
const staleEngine = new CalendarSyncEngine({
  config: shortLeaseConfig, store: fencedStore, provider: fencedProvider,
  clock: () => fenceNow, sleep: async () => {}, workerId: 'stale-rev1'
});
const currentEngine = new CalendarSyncEngine({
  config: shortLeaseConfig, store: fencedStore, provider: fencedProvider,
  clock: () => fenceNow, sleep: async () => {}, workerId: 'current-rev2'
});
const staleRun = staleEngine.processOutbox();
await oldReadReached;
fenceNow = 1100;
const currentRun = await currentEngine.processOutbox();
assert.equal(currentRun.results[0].ok, true);
releaseOldRead();
const staleResult = await staleRun;
assert.equal(staleResult.results[0].staleFence, true);
assert.equal(fencedProvider.events.size, 1, 'rev1 resume cannot perform a second remote mutation');
assert.equal(fencedProvider.calls.filter(call => call.method === 'insertEvent').length, 1);
const fencedMapping = await fencedStore.getMapping('daily|2026-07-14|emp1');
assert.equal(fencedMapping.syncedAtMs, 1100, 'rev1 resume cannot overwrite the rev2 mapping');

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
assert.equal((await engine.acceptWebhook({
  'x-goog-channel-id': channel.id,
  'x-goog-resource-id': channel.resourceId,
  'x-goog-channel-token': channel.token,
  'x-goog-resource-state': 'exists',
  'x-goog-message-number': '10'
})).accepted, true);
assert.equal(Object.keys(store.meta.pull_signals).length, 1, 'duplicate message number is deduplicated');
const listCountBeforeSignal = provider.calls.filter(call => call.method === 'listEventsPage').length;
const signalPull = await engine.processPullSignals();
assert.equal(signalPull.processed, 1);
assert.equal(signalPull.status, 'pulled');
assert.equal(provider.calls.filter(call => call.method === 'listEventsPage').length, listCountBeforeSignal + 1, 'one deduped signal causes one incremental pull');
assert.equal((await engine.processPullSignals()).processed, 0);
assert.equal((await engine.acceptWebhook({
  'x-goog-channel-id': channel.id,
  'x-goog-resource-id': channel.resourceId,
  'x-goog-channel-token': 'wrong'
})).status, 403);

console.log('calendar sync engine ok');
