import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FirebaseScheduleStore } from '../server/calendar_sync/store.mjs';

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
assert.equal((await store.claimOutbox({ nowMs: 1099, leaseMs: 100, ownerId: 'early' })).length, 0);
const recovered = (await store.claimOutbox({ nowMs: 1100, leaseMs: 100, ownerId: 'recovery' }))[0];
assert.equal(recovered.lease_epoch, firstClaim.lease_epoch + 1);
assert.equal(await store.finishOutbox(item.id, firstClaim, { status: 'done' }), null, 'stale Firebase fence cannot mark done');
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

const destinationPath = 'workschedule_v2/overrides/2026-07-15/emp1';
const priorPath = 'workschedule_v2/overrides/2026-07-14/emp1';
const moveChange = {
  action: 'move', date: '2026-07-15', priorDate: '2026-07-14', employeeId: 'emp1',
  row: {
    state: 'shift', type: 'manual_shift', start: '10:00', end: '18:00', role: '주방',
    shift: { start: '10:00', end: '18:00', role: '주방' }, google_event_id: 'move-event', google_etag: '"g1"'
  }
};
const missingExpectation = await store.getExplicitOverrideState('2026-07-15', 'emp1');
fake.set(destinationPath, { state: 'shift', start: '08:00', end: '16:00', updated_at_ms: 7 });
await assert.rejects(
  () => store.writeImportedChange(moveChange, { nowMs: 2000, destinationExpectation: missingExpectation }),
  error => error && error.code === 'move_destination_occupied'
);
assert.equal(fake.get(destinationPath).start, '08:00');

fake.set(destinationPath, null);
const raceExpectation = await store.getExplicitOverrideState('2026-07-15', 'emp1');
fake.beforeConditionalPut = (path, database) => {
  if (path === destinationPath) database.set(path, { state: 'off', updated_at_ms: 8 });
};
await assert.rejects(
  () => store.writeImportedChange(moveChange, { nowMs: 2100, destinationExpectation: raceExpectation }),
  error => error && error.code === 'etag_conflict'
);
assert.equal(fake.get(destinationPath).state, 'off', 'racing explicit override wins over stale importer ETag');

fake.set(destinationPath, { state: 'shift', google_event_id: 'move-event', updated_at_ms: 9 });
fake.set(priorPath, { state: 'shift', google_event_id: 'move-event', updated_at_ms: 3 });
const sameEventExpectation = await store.getExplicitOverrideState('2026-07-15', 'emp1');
await store.writeImportedChange(moveChange, { nowMs: 2200, destinationExpectation: sameEventExpectation });
assert.equal(fake.get(destinationPath).google_event_id, 'move-event', 'same event ID is idempotently writable');

console.log('calendar firebase store ok');
