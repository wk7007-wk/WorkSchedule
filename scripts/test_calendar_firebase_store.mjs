import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createFirebaseAdminAtomicMoveWriter, FirebaseScheduleStore } from '../server/calendar_sync/store.mjs';
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
  constructor(overrides) {
    this.overrides = clone(overrides || {});
    this.failBeforeCommit = false;
    this.retryMutation = null;
    this.transactionCalls = 0;
  }

  ref(path) {
    assert.equal(path, '/workschedule_v2/overrides');
    return {
      transaction: async update => {
        this.transactionCalls += 1;
        let proposed = update(clone(this.overrides));
        if (proposed === undefined) return { committed: false, snapshot: { val: () => clone(this.overrides) } };
        if (this.failBeforeCommit) throw new Error('injected transaction failure');
        if (this.retryMutation) {
          const mutate = this.retryMutation;
          this.retryMutation = null;
          mutate(this.overrides);
          proposed = update(clone(this.overrides));
          if (proposed === undefined) return { committed: false, snapshot: { val: () => clone(this.overrides) } };
        }
        this.overrides = clone(proposed);
        return { committed: true, snapshot: { val: () => clone(this.overrides) } };
      }
    };
  }
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
  () => store.writeImportedMoveAtomic(moveChange, { nowMs: 2000, sourceExpectedRevision: '3' }),
  error => error && error.code === 'atomic_move_unavailable'
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

const racedAdmin = new FakeAdminDatabase({ '2026-07-14': { emp1: sourceRow } });
racedAdmin.overrides['2026-07-14'].emp1 = Object.assign({}, sourceRow, { start: '11:00', updated_at_ms: 4 });
await assert.rejects(
  () => createFirebaseAdminAtomicMoveWriter(racedAdmin)({
    change: moveChange, nowMs: 2100, sourceExpectedRevision: sourceExpectation.revision,
    sourceExpectation, destinationExpectation: missingDestination
  }),
  error => error && error.code === 'move_source_changed'
);
assert.equal(racedAdmin.overrides['2026-07-14'].emp1.start, '11:00');
assert.equal(racedAdmin.overrides['2026-07-15'], undefined, 'source race leaves destination untouched');

const failedAdmin = new FakeAdminDatabase({ '2026-07-14': { emp1: sourceRow } });
failedAdmin.failBeforeCommit = true;
await assert.rejects(
  () => createFirebaseAdminAtomicMoveWriter(failedAdmin)({
    change: moveChange, nowMs: 2200, sourceExpectedRevision: sourceExpectation.revision,
    sourceExpectation, destinationExpectation: missingDestination
  }),
  /injected transaction failure/
);
assert.deepEqual(failedAdmin.overrides, { '2026-07-14': { emp1: sourceRow } }, 'mid-transaction failure commits neither side');

const retryAdmin = new FakeAdminDatabase({
  '2026-07-14': { emp1: sourceRow },
  '2026-07-16': { emp2: { empty: [], zero: 0, note: '' } }
});
retryAdmin.retryMutation = overrides => {
  overrides['2026-07-17'] = { emp3: { empty: [], zero: 0 } };
};
const atomicWriter = createFirebaseAdminAtomicMoveWriter(retryAdmin);
const firstMove = await atomicWriter({
  change: moveChange, nowMs: 2300, sourceExpectedRevision: sourceExpectation.revision,
  sourceExpectation, destinationExpectation: missingDestination
});
assert.equal(firstMove.row.google_event_id, 'move-event');
assert.equal(retryAdmin.overrides['2026-07-14'].emp1.state, 'clear');
assert.equal(retryAdmin.overrides['2026-07-15'].emp1.google_event_id, 'move-event');
assert.deepEqual(retryAdmin.overrides['2026-07-16'].emp2, { empty: [], zero: 0, note: '' });
assert.deepEqual(retryAdmin.overrides['2026-07-17'].emp3, { empty: [], zero: 0 }, 'transaction retry preserves concurrent unrelated rows');

const retrySnapshot = clone(retryAdmin.overrides);
const repeated = await atomicWriter({
  change: moveChange, nowMs: 2400, sourceExpectedRevision: sourceExpectation.revision,
  sourceExpectation, destinationExpectation: missingDestination
});
assert.equal(repeated.idempotent, true);
assert.deepEqual(retryAdmin.overrides, retrySnapshot, 'same-event retry is idempotent');

const statusFirebase = new FakeFirebase();
const atomicStore = new FirebaseScheduleStore({
  databaseUrl: 'https://firebase.test', fetchImpl: statusFirebase.fetch.bind(statusFirebase), atomicMoveWriter: atomicWriter
});
await atomicStore.writeImportedMoveAtomic(moveChange, {
  nowMs: 2500, sourceExpectedRevision: sourceExpectation.revision,
  sourceExpectation, destinationExpectation: missingDestination
});
assert.equal(statusFirebase.get('workschedule_v2/status/2026-07-15/emp1').state, 'confirmed');
assert.equal(statusFirebase.get('workschedule_v2/status/2026-07-14/emp1').state, 'clear');
assert.equal(
  statusFirebase.requests.some(request => request.method === 'PUT' && request.path.startsWith('workschedule_v2/overrides')),
  false,
  'atomic move never rewrites canonical overrides through REST PUT'
);

console.log('calendar firebase store ok');
