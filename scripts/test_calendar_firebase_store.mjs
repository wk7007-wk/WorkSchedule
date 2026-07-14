import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  createFirebaseAdminAtomicImportWriter,
  createFirebaseAdminMappingCasWriter,
  FirebaseScheduleStore
} from '../server/calendar_sync/store.mjs';
import { revisionOf } from '../server/calendar_sync/domain.mjs';

const require = createRequire(import.meta.url);
const core = require('../docs/calendar_core_logic.js');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

class FakeFirebase {
  constructor() {
    this.data = {};
    this.versions = new Map();
    this.beforeConditionalPut = null;
    this.requests = [];
  }

  pathFromUrl(url) {
    return new URL(url).pathname.replace(/^\/+/, '').replace(/\.json$/, '');
  }

  parts(path) {
    return String(path || '').split('/').filter(Boolean).map(decodeURIComponent);
  }

  get(path) {
    let node = this.data;
    for (const part of this.parts(path)) {
      if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) return null;
      node = node[part];
    }
    return clone(node);
  }

  set(path, value) {
    const parts = this.parts(path);
    let node = this.data;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!node[parts[index]] || typeof node[parts[index]] !== 'object') node[parts[index]] = {};
      node = node[parts[index]];
    }
    const leaf = parts[parts.length - 1];
    if (value == null) delete node[leaf];
    else node[leaf] = clone(value);
    this.versions.set(path, Number(this.versions.get(path) || 0) + 1);
  }

  patch(path, patch) {
    const current = this.get(path) || {};
    this.set(path, Object.assign(current, clone(patch)));
  }

  etag(path) {
    return this.get(path) == null ? 'null_etag' : '"v' + Number(this.versions.get(path) || 0) + '"';
  }

  header(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : '';
  }

  async fetch(url, options = {}) {
    const path = this.pathFromUrl(url);
    const method = String(options.method || 'GET').toUpperCase();
    this.requests.push({ path, method });
    if (method === 'GET') {
      return new Response(JSON.stringify(this.get(path)), { status: 200, headers: { etag: this.etag(path) } });
    }
    if (method === 'PUT') {
      const expected = this.header(options.headers, 'if-match');
      if (expected && this.beforeConditionalPut) {
        const hook = this.beforeConditionalPut;
        this.beforeConditionalPut = null;
        hook(path, this);
      }
      if (expected && expected !== this.etag(path)) return new Response('null', { status: 412 });
      const value = JSON.parse(options.body);
      this.set(path, value);
      return new Response(JSON.stringify(value), { status: 200, headers: { etag: this.etag(path) } });
    }
    if (method === 'PATCH') {
      this.patch(path, JSON.parse(options.body));
      return new Response(JSON.stringify(this.get(path)), { status: 200, headers: { etag: this.etag(path) } });
    }
    return new Response('null', { status: 405 });
  }
}

class FakeAdminDatabase {
  constructor(root) {
    this.root = clone(root || {});
    this.failBeforeCommit = false;
    this.retryMutation = null;
    this.transactionCalls = 0;
  }

  parts(path) {
    const normalized = String(path || '').replace(/^\/workschedule_v2\/?/, '');
    return normalized.split('/').filter(Boolean);
  }

  get(path) {
    let node = this.root;
    for (const part of this.parts(path)) {
      if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) return null;
      node = node[part];
    }
    return clone(node);
  }

  set(path, value) {
    const parts = this.parts(path);
    if (!parts.length) {
      this.root = clone(value || {});
      return;
    }
    let node = this.root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (!node[parts[index]] || typeof node[parts[index]] !== 'object') node[parts[index]] = {};
      node = node[parts[index]];
    }
    node[parts[parts.length - 1]] = clone(value);
  }

  ref(path) {
    assert.ok(['/workschedule_v2', '/workschedule_v2/meta/calendar_core/google'].includes(path));
    return {
      transaction: async update => {
        this.transactionCalls += 1;
        let proposed = update(this.get(path));
        if (proposed === undefined) return { committed: false, snapshot: { val: () => this.get(path) } };
        if (this.failBeforeCommit) throw new Error('injected transaction failure');
        if (this.retryMutation) {
          const mutate = this.retryMutation;
          this.retryMutation = null;
          mutate(this.root);
          proposed = update(this.get(path));
          if (proposed === undefined) return { committed: false, snapshot: { val: () => this.get(path) } };
        }
        this.set(path, proposed);
        return { committed: true, snapshot: { val: () => this.get(path) } };
      }
    };
  }
}

function addPullGuard(root, owner = 'admin-pull', nowMs = 2000) {
  const claim = {
    status: 'running', lease_owner: owner, lease_epoch: 1, fence_token: owner + '-fence',
    lease_claimed_at_ms: nowMs, lease_expires_at_ms: nowMs + 600000
  };
  root.meta ||= {};
  root.meta.calendar_core ||= {};
  root.meta.calendar_core.google ||= {};
  root.meta.calendar_core.google.pull_lease = clone(claim);
  return { kind: 'pull', id: 'global', claim };
}

const fake = new FakeFirebase();
const store = new FirebaseScheduleStore({ databaseUrl: 'https://firebase.test', fetchImpl: fake.fetch.bind(fake) });
const item = core.buildOutboxItem({
  entity: 'daily_override', date: '2026-07-14', employeeId: 'emp1',
  row: { state: 'shift', start: '10:00', end: '18:00', updated_at_ms: 1 }, nowMs: 1000
});
await store.enqueueOutbox(item);
const [claimsA, claimsB] = await Promise.all([
  store.claimOutbox({ nowMs: 1000, leaseMs: 100, ownerId: 'firebase-a' }),
  store.claimOutbox({ nowMs: 1000, leaseMs: 100, ownerId: 'firebase-b' })
]);
assert.equal(claimsA.length + claimsB.length, 1, 'Firebase if-match allows only one claim');
const firstClaim = claimsA[0] || claimsB[0];
assert.ok(await store.assertOutboxClaim(item.id, firstClaim, { nowMs: 1050 }));
const renewedClaim = await store.renewOutboxLease(item.id, firstClaim, { nowMs: 1050, leaseMs: 100 });
assert.equal(renewedClaim.lease_expires_at_ms, 1150);
assert.equal((await store.claimOutbox({ nowMs: 1149, leaseMs: 100, ownerId: 'early' })).length, 0);
const recovered = (await store.claimOutbox({ nowMs: 1150, leaseMs: 100, ownerId: 'recovery' }))[0];
assert.equal(recovered.lease_epoch, firstClaim.lease_epoch + 1);
assert.equal(await store.finishOutbox(item.id, firstClaim, { status: 'done' }), null, 'stale Firebase fence cannot mark done');
assert.equal(await store.renewOutboxLease(item.id, renewedClaim, { nowMs: 1150, leaseMs: 100 }), null);
assert.ok(await store.finishOutbox(item.id, recovered, { status: 'done' }));

const [pullClaimA, pullClaimB] = await Promise.all([
  store.claimPullLease({ nowMs: 1160, leaseMs: 100, ownerId: 'pull-a' }),
  store.claimPullLease({ nowMs: 1160, leaseMs: 100, ownerId: 'pull-b' })
]);
assert.equal([pullClaimA, pullClaimB].filter(Boolean).length, 1, 'Firebase ETag allows only one global pull owner');
const pullClaim = pullClaimA || pullClaimB;
assert.ok(await store.assertPullLease(pullClaim, { nowMs: 1200 }));
const renewedPullClaim = await store.renewPullLease(pullClaim, { nowMs: 1200, leaseMs: 100 });
assert.equal(renewedPullClaim.lease_expires_at_ms, 1300);
assert.equal(await store.releasePullLease(renewedPullClaim, { nowMs: 1210 }).then(Boolean), true);

const signal = {
  channel_id: 'channel-1', resource_id: 'resource-1', message_number: '42',
  at_ms: 1200, status: 'pending', next_attempt_at_ms: 1200
};
const signalIds = await Promise.all([store.enqueuePullSignal(signal), store.enqueuePullSignal(signal)]);
assert.equal(signalIds[0], signalIds[1]);
assert.equal(Object.keys(fake.get('workschedule_v2/meta/calendar_core/google/pull_signals')).length, 1, 'Firebase webhook dedupe is atomic');
const [signalClaimsA, signalClaimsB] = await Promise.all([
  store.claimPullSignals({ nowMs: 1200, leaseMs: 100, ownerId: 'signal-a' }),
  store.claimPullSignals({ nowMs: 1200, leaseMs: 100, ownerId: 'signal-b' })
]);
assert.equal(signalClaimsA.length + signalClaimsB.length, 1);
const signalClaim = signalClaimsA[0] || signalClaimsB[0];
assert.ok(await store.finishPullSignal(signalClaim.id, signalClaim, { status: 'done' }));

const moveChange = {
  action: 'move', date: '2026-07-15', priorDate: '2026-07-14', employeeId: 'emp1',
  row: {
    state: 'shift', type: 'manual_shift', start: '10:00', end: '18:00', role: '주방',
    shift: { start: '10:00', end: '18:00', role: '주방' }, google_event_id: 'move-event', google_etag: '"g1"'
  }
};
const restWritesBeforeMove = fake.requests.filter(request => ['PUT', 'PATCH'].includes(request.method)).length;
await assert.rejects(
  () => store.writeImportedAtomic(moveChange, { nowMs: 2000, expectedCanonicalRevision: '3' }),
  error => error && error.code === 'atomic_import_unavailable'
);
assert.equal(
  fake.requests.filter(request => ['PUT', 'PATCH'].includes(request.method)).length,
  restWritesBeforeMove,
  'REST-only store fails closed before any canonical/status write'
);

const sourceRow = {
  state: 'shift', start: '10:00', end: '18:00', shift: { start: '10:00', end: '18:00', role: '주방' },
  google_event_id: 'move-event', updated_at_ms: 3
};
const sourceExpectation = { exists: true, revision: revisionOf(sourceRow), googleEventId: 'move-event', row: clone(sourceRow) };
const missingDestination = { exists: false, revision: '', googleEventId: '', row: null };

const racedAdmin = new FakeAdminDatabase({
  employees: { emp1: { name: '이원규', active: true } }, fixed_schedules: {},
  overrides: { '2026-07-14': { emp1: sourceRow } }, status: {}, attendance: { marker: 0 }
});
const racedGuard = addPullGuard(racedAdmin.root, 'raced-pull', 2000);
racedAdmin.root.overrides['2026-07-14'].emp1 = Object.assign({}, sourceRow, { start: '11:00', updated_at_ms: 4 });
await assert.rejects(
  () => createFirebaseAdminAtomicImportWriter(racedAdmin)({
    change: moveChange, nowMs: 2100, expectedCanonicalRevision: sourceExpectation.revision,
    sourceExpectation, destinationExpectation: missingDestination, guard: racedGuard
  }),
  error => error && error.code === 'move_source_changed'
);
assert.equal(racedAdmin.root.overrides['2026-07-14'].emp1.start, '11:00');
assert.equal(racedAdmin.root.overrides['2026-07-15'], undefined, 'source race leaves destination untouched');
assert.equal(racedAdmin.root.status['2026-07-15'], undefined, 'source race leaves status untouched');

const fixedRowV1 = {
  kind: 'weekly', days: ['tue'], start: '10:00', end: '18:00', role: '주방', updated_at_ms: 10
};
const fixedRaceAdmin = new FakeAdminDatabase({
  employees: { emp1: { name: '이원규', active: true } },
  fixed_schedules: { emp1: fixedRowV1 }, overrides: {}, status: {}, attendance: { untouched: [] }
});
const fixedRaceGuard = addPullGuard(fixedRaceAdmin.root, 'fixed-race-pull', 2100);
fixedRaceAdmin.retryMutation = root => {
  root.fixed_schedules.emp1 = Object.assign({}, root.fixed_schedules.emp1, { start: '11:00', updated_at_ms: 11 });
};
await assert.rejects(
  () => createFirebaseAdminAtomicImportWriter(fixedRaceAdmin)({
    change: moveChange, nowMs: 2150, expectedCanonicalRevision: revisionOf(fixedRowV1),
    sourceExpectation: missingDestination, destinationExpectation: missingDestination, guard: fixedRaceGuard
  }),
  error => error && error.code === 'move_source_changed'
);
assert.equal(fixedRaceAdmin.root.fixed_schedules.emp1.start, '11:00', 'fixed rev2 wins the transaction retry');
assert.deepEqual(fixedRaceAdmin.root.overrides, {}, 'fixed-source rev1 cannot create either move override');
assert.deepEqual(fixedRaceAdmin.root.status, {}, 'fixed-source rev1 cannot write status');

const failedAdmin = new FakeAdminDatabase({
  employees: { emp1: { name: '이원규', active: true } }, fixed_schedules: {},
  overrides: { '2026-07-14': { emp1: sourceRow } }, status: {}, attendance: { untouched: 0 }
});
const failedGuard = addPullGuard(failedAdmin.root, 'failed-pull', 2150);
const failedSnapshot = clone(failedAdmin.root);
failedAdmin.failBeforeCommit = true;
await assert.rejects(
  () => createFirebaseAdminAtomicImportWriter(failedAdmin)({
    change: moveChange, nowMs: 2200, expectedCanonicalRevision: sourceExpectation.revision,
    sourceExpectation, destinationExpectation: missingDestination, guard: failedGuard
  }),
  /injected transaction failure/
);
assert.deepEqual(failedAdmin.root, failedSnapshot, 'mid-transaction failure commits no canonical or status field');

const retryAdmin = new FakeAdminDatabase({
  employees: { emp1: { name: '이원규', active: true }, preserve: { empty: [], zero: 0 } },
  fixed_schedules: {},
  overrides: {
    '2026-07-14': { emp1: sourceRow },
    '2026-07-16': { emp2: { empty: [], zero: 0, note: '' } }
  },
  status: { '2026-07-16': { emp2: { zero: 0, empty: [] } } },
  attendance: { '2026-07-14': { emp1: { actual_start: '', zero: 0, empty: [] } } },
  attendance_meta: { zero: 0, empty: [] },
  unrelated_zero: 0,
  unrelated_empty: []
});
const retryGuard = addPullGuard(retryAdmin.root, 'retry-pull', 2200);
retryAdmin.root.meta.calendar_core.google.unrelated = { zero: 0, empty: [] };
retryAdmin.retryMutation = root => {
  root.overrides['2026-07-17'] = { emp3: { empty: [], zero: 0 } };
};
const atomicWriter = createFirebaseAdminAtomicImportWriter(retryAdmin);
const firstMove = await atomicWriter({
  change: moveChange, nowMs: 2300, expectedCanonicalRevision: sourceExpectation.revision,
  sourceExpectation, destinationExpectation: missingDestination, guard: retryGuard
});
assert.equal(firstMove.row.google_event_id, 'move-event');
assert.equal(retryAdmin.root.overrides['2026-07-14'].emp1.state, 'clear');
assert.equal(retryAdmin.root.overrides['2026-07-15'].emp1.google_event_id, 'move-event');
assert.equal(retryAdmin.root.status['2026-07-15'].emp1.state, 'confirmed');
assert.equal(retryAdmin.root.status['2026-07-14'].emp1.state, 'clear');
assert.deepEqual(retryAdmin.root.overrides['2026-07-16'].emp2, { empty: [], zero: 0, note: '' });
assert.deepEqual(retryAdmin.root.overrides['2026-07-17'].emp3, { empty: [], zero: 0 }, 'transaction retry preserves concurrent unrelated rows');
assert.deepEqual(retryAdmin.root.employees.preserve, { empty: [], zero: 0 });
assert.deepEqual(retryAdmin.root.attendance['2026-07-14'].emp1, { actual_start: '', zero: 0, empty: [] });
assert.deepEqual(retryAdmin.root.attendance_meta, { zero: 0, empty: [] });
assert.equal(retryAdmin.root.unrelated_zero, 0);
assert.deepEqual(retryAdmin.root.unrelated_empty, []);
assert.deepEqual(retryAdmin.root.meta.calendar_core.google.unrelated, { zero: 0, empty: [] });

const retrySnapshot = clone(retryAdmin.root);
const repeated = await atomicWriter({
  change: moveChange, nowMs: 2400, expectedCanonicalRevision: sourceExpectation.revision,
  sourceExpectation, destinationExpectation: missingDestination, guard: retryGuard
});
assert.equal(repeated.idempotent, true);
assert.deepEqual(retryAdmin.root, retrySnapshot, 'same-event retry with complete status is idempotent');

const sameDateRow = {
  state: 'shift', type: 'manual_shift', start: '12:00', end: '20:00', role: '홀',
  shift: { start: '12:00', end: '20:00', role: '홀' }, google_event_id: 'same-event',
  google_etag: '"same-etag"', updated_at_ms: 50, zero: 0, empty: []
};
const sameDateChange = {
  action: 'upsert_shift', date: '2026-07-18', priorDate: '2026-07-18', employeeId: 'emp1',
  row: clone(sameDateRow)
};
const sameDateAdmin = new FakeAdminDatabase({
  employees: { emp1: { name: '이원규', active: true } }, fixed_schedules: {},
  overrides: { '2026-07-18': { emp1: sameDateRow } }, status: {}, attendance: { preserve: 0 }
});
const sameDateGuard = addPullGuard(sameDateAdmin.root, 'same-date-pull', 2400);
const sameDateWriter = createFirebaseAdminAtomicImportWriter(sameDateAdmin);
const sameDateOverrideBefore = clone(sameDateAdmin.root.overrides['2026-07-18'].emp1);
await sameDateWriter({
  change: sameDateChange, nowMs: 2500, expectedCanonicalRevision: revisionOf(sameDateRow), guard: sameDateGuard
});
assert.deepEqual(sameDateAdmin.root.overrides['2026-07-18'].emp1, sameDateOverrideBefore, 'same-event retry repairs status without rewriting override');
assert.equal(sameDateAdmin.root.status['2026-07-18'].emp1.google_event_id, 'same-event');
const sameDateRepaired = clone(sameDateAdmin.root);
await sameDateWriter({
  change: sameDateChange, nowMs: 2600, expectedCanonicalRevision: revisionOf(sameDateRow), guard: sameDateGuard
});
assert.deepEqual(sameDateAdmin.root, sameDateRepaired, 'completed same-date repair is idempotent');

const statusFirebase = new FakeFirebase();
const atomicStore = new FirebaseScheduleStore({
  databaseUrl: 'https://firebase.test', fetchImpl: statusFirebase.fetch.bind(statusFirebase), atomicImportWriter: atomicWriter
});
await atomicStore.writeImportedAtomic(moveChange, {
  nowMs: 2700, expectedCanonicalRevision: sourceExpectation.revision,
  sourceExpectation, destinationExpectation: missingDestination, guard: retryGuard
});
assert.equal(
  statusFirebase.requests.some(request => ['PUT', 'PATCH'].includes(request.method)
    && (request.path.startsWith('workschedule_v2/overrides') || request.path.startsWith('workschedule_v2/status'))),
  false,
  'atomic import never writes canonical or status through REST'
);

const mappingWriter = createFirebaseAdminMappingCasWriter(retryAdmin);
const mappingKey = 'daily|2026-07-20|emp1';
const newerMapping = await mappingWriter({
  type: 'set', key: mappingKey, expectedEtag: 'null_etag', guard: retryGuard, nowMs: 2800,
  value: {
    eventId: 'mapping-event', googleEtag: '"e2"', googleUpdated: '2026-07-14T03:00:02.000Z',
    canonicalRevision: 'rev2', employeeId: 'emp1', date: '2026-07-20'
  }
});
const mappingSnapshot = clone(retryAdmin.root.meta.calendar_core.google.mappings);
await assert.rejects(
  () => mappingWriter({
    type: 'set', key: mappingKey, expectedEtag: newerMapping.cas_etag, guard: retryGuard, nowMs: 2900,
    value: {
      eventId: 'mapping-event', googleEtag: '"e1"', googleUpdated: '2026-07-14T03:00:01.000Z',
      canonicalRevision: 'rev1', employeeId: 'emp1', date: '2026-07-20'
    }
  }),
  error => error && error.code === 'stale_google_event'
);
assert.deepEqual(retryAdmin.root.meta.calendar_core.google.mappings, mappingSnapshot, 'delayed older mapping cannot commit');
await assert.rejects(
  () => mappingWriter({
    type: 'move', fromKey: mappingKey, toKey: 'daily|2026-07-21|emp1',
    expectedFromEtag: newerMapping.cas_etag, expectedToEtag: 'null_etag', guard: retryGuard, nowMs: 2900,
    value: {
      eventId: 'mapping-event', googleEtag: '"e1"', googleUpdated: '2026-07-14T03:00:01.000Z',
      canonicalRevision: 'rev1', employeeId: 'emp1', date: '2026-07-21'
    }
  }),
  error => error && error.code === 'stale_google_event'
);
assert.deepEqual(retryAdmin.root.meta.calendar_core.google.mappings, mappingSnapshot, 'delayed older mapping move cannot delete its newer source');
await assert.rejects(
  () => mappingWriter({ type: 'delete', key: mappingKey, expectedEtag: newerMapping.cas_etag, nowMs: 2900 }),
  error => error && error.code === 'mapping_guard_required'
);

const noMappingWriterFake = new FakeFirebase();
const noMappingWriterStore = new FirebaseScheduleStore({
  databaseUrl: 'https://firebase.test', fetchImpl: noMappingWriterFake.fetch.bind(noMappingWriterFake)
});
const noMappingWritesBefore = noMappingWriterFake.requests.length;
await assert.rejects(
  () => noMappingWriterStore.casSetMapping(mappingKey, newerMapping, { expectedEtag: 'null_etag', guard: retryGuard, nowMs: 3000 }),
  error => error && error.code === 'mapping_guard_required'
);
assert.equal(noMappingWriterFake.requests.length, noMappingWritesBefore, 'mapping mutation without Admin CAS makes zero REST requests');

const timeoutStore = new FirebaseScheduleStore({
  databaseUrl: 'https://firebase.test',
  fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; },
  requestTimeoutMs: 1000
});
await assert.rejects(
  () => timeoutStore.get('/workschedule_v2/employees'),
  error => error && error.code === 'firebase_timeout' && error.retryable === true
);

console.log('calendar firebase store ok');
