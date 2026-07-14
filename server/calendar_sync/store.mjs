import crypto from 'node:crypto';
import {
  AtomicMoveUnavailableError,
  DestinationCollisionError,
  EtagConflictError,
  SourceRevisionConflictError
} from './errors.mjs';
import { addWriteMetadata, canonicalKey, revisionOf, resolveCanonicalDay } from './domain.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../docs/calendar_core_logic.js');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function auditKey(nowMs) {
  return String(nowMs).padStart(13, '0') + '_' + crypto.randomBytes(5).toString('hex');
}

function statusForChange(change, nowMs) {
  const state = change.action === 'clear' ? 'clear' : change.action === 'off' ? 'off' : 'confirmed';
  return {
    status: state,
    state,
    confirmed: state === 'confirmed',
    source: 'google_calendar',
    google_event_id: change.row && change.row.google_event_id || '',
    google_etag: change.row && change.row.google_etag || '',
    updated_at_ms: nowMs,
    updated_at: new Date(nowMs).toISOString()
  };
}

function claimable(row, nowMs) {
  if (!row) return false;
  if (['pending', 'retry'].includes(row.status)) return Number(row.next_attempt_at_ms || 0) <= nowMs;
  return row.status === 'running' && Number(row.lease_expires_at_ms || 0) <= nowMs;
}

function claimedRow(row, { nowMs, leaseMs, ownerId }) {
  const leaseEpoch = Number(row.lease_epoch || 0) + 1;
  return Object.assign({}, clone(row), {
    status: 'running',
    lease_owner: String(ownerId),
    lease_epoch: leaseEpoch,
    fence_token: leaseEpoch + ':' + crypto.randomUUID(),
    lease_claimed_at_ms: nowMs,
    lease_expires_at_ms: nowMs + leaseMs
  });
}

function fenced(row, claim) {
  return !!row && row.status === 'running'
    && String(row.lease_owner || '') === String(claim.lease_owner || '')
    && Number(row.lease_epoch || 0) === Number(claim.lease_epoch || 0)
    && String(row.fence_token || '') === String(claim.fence_token || '');
}

function completedRow(row, patch) {
  return Object.assign({}, clone(row), clone(patch), {
    lease_owner: null,
    fence_token: null,
    lease_claimed_at_ms: null,
    lease_expires_at_ms: null
  });
}

function pullSignalId(row) {
  const identity = [row.channel_id || '', row.resource_id || '', row.message_number || ''].join('|');
  return 'signal_' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32);
}

function explicitState(row) {
  return {
    exists: row != null,
    revision: row == null ? '' : revisionOf(row),
    googleEventId: String(row && row.google_event_id || ''),
    row: clone(row)
  };
}

function validateMoveDestination(change, current, expectation) {
  if (change.action !== 'move') return;
  const incomingEventId = String(change.row && change.row.google_event_id || '');
  const currentEventId = String(current && current.google_event_id || '');
  const sameEvent = !!current && !!incomingEventId && currentEventId === incomingEventId;
  if (current && !sameEvent) throw new DestinationCollisionError();
  if (!expectation) return;
  if (expectation.exists !== (current != null)) throw new DestinationCollisionError('Move destination changed after collision check');
  if (current && expectation.revision != null && revisionOf(current) !== String(expectation.revision)) {
    throw new DestinationCollisionError('Move destination revision changed after collision check');
  }
}

function moveRows(change, nowMs) {
  const row = addWriteMetadata(change.row, { nowMs, source: 'google_calendar' });
  const clear = addWriteMetadata({
    state: 'clear', type: 'clear', shift: null, start: '', end: '', role: '', work: false, active: false,
    off: false, dayoff: false, clear: true, google_event_id: change.row.google_event_id || '',
    google_etag: change.row.google_etag || '', moved_to: change.date
  }, { nowMs, source: 'google_calendar' });
  return { row, clear };
}

function sameAppliedMove(change, source, destination) {
  const eventId = String(change.row && change.row.google_event_id || '');
  return !!eventId
    && String(destination && destination.google_event_id || '') === eventId
    && String(source && source.google_event_id || '') === eventId
    && (source && (source.clear === true || String(source.state || source.status || source.type || '').toLowerCase() === 'clear'));
}

function validateMoveSource(source, sourceExpectedRevision, sourceExpectation) {
  if (sourceExpectation) {
    if (sourceExpectation.exists !== (source != null)) throw new SourceRevisionConflictError();
    if (source && sourceExpectation.revision != null && revisionOf(source) !== String(sourceExpectation.revision)) {
      throw new SourceRevisionConflictError();
    }
  }
  // A fixed-schedule source has no explicit override inside this transaction;
  // its missing expectation is fenced here while the resolved revision was
  // already checked by the engine.
  if (source && sourceExpectedRevision != null && revisionOf(source) !== String(sourceExpectedRevision)) {
    throw new SourceRevisionConflictError();
  }
}

export function createFirebaseAdminAtomicMoveWriter(database) {
  if (!database || typeof database.ref !== 'function') throw new AtomicMoveUnavailableError('Firebase Admin database.ref is required');
  return async function writeAtomicMove({ change, nowMs = Date.now(), sourceExpectedRevision = null, sourceExpectation = null, destinationExpectation = null }) {
    if (!change || change.action !== 'move' || !change.priorDate || change.priorDate === change.date) {
      throw new AtomicMoveUnavailableError('Atomic move writer requires two distinct dates');
    }
    const ref = database.ref('/workschedule_v2/overrides');
    let blocked = null;
    let committedRows = null;
    const result = await ref.transaction(currentValue => {
      const current = currentValue && typeof currentValue === 'object' ? currentValue : {};
      const source = current[change.priorDate] && current[change.priorDate][change.employeeId];
      const destination = current[change.date] && current[change.date][change.employeeId];
      if (sameAppliedMove(change, source, destination)) {
        committedRows = { row: clone(destination), clear: clone(source), idempotent: true };
        return current;
      }
      try {
        validateMoveSource(source, sourceExpectedRevision, sourceExpectation);
        validateMoveDestination(change, destination, destinationExpectation);
      } catch (error) {
        blocked = error;
        return undefined;
      }
      const next = clone(current);
      if (!next[change.date] || typeof next[change.date] !== 'object') next[change.date] = {};
      if (!next[change.priorDate] || typeof next[change.priorDate] !== 'object') next[change.priorDate] = {};
      committedRows = moveRows(change, nowMs);
      next[change.date][change.employeeId] = committedRows.row;
      next[change.priorDate][change.employeeId] = committedRows.clear;
      return next;
    }, undefined, false);
    if (!result || result.committed !== true) throw blocked || new SourceRevisionConflictError('Atomic move transaction aborted');
    return clone(committedRows);
  };
}

export class MemorySyncStore {
  constructor(snapshot = {}) {
    this.snapshot = {
      employees: clone(snapshot.employees || {}),
      fixed_schedules: clone(snapshot.fixed_schedules || {}),
      overrides: clone(snapshot.overrides || {}),
      status: clone(snapshot.status || {}),
      attendance: clone(snapshot.attendance || {})
    };
    this.meta = {
      outbox: {}, mappings: {}, mirror: {}, sync_state: {}, audits: {}, conflicts: {}, pull_signals: {}, channel: null, overlay: {}
    };
  }

  async getSnapshot() {
    return clone(this.snapshot);
  }

  async enqueueOutbox(item) {
    if (!this.meta.outbox[item.id]) this.meta.outbox[item.id] = clone(item);
    return clone(this.meta.outbox[item.id]);
  }

  async listPendingOutbox({ nowMs = Date.now(), limit = 50 } = {}) {
    return Object.values(this.meta.outbox)
      .filter(item => ['pending', 'retry'].includes(item.status) && Number(item.next_attempt_at_ms || 0) <= nowMs)
      .sort((left, right) => Number(left.created_at_ms || 0) - Number(right.created_at_ms || 0))
      .slice(0, limit)
      .map(clone);
  }

  async claimOutbox({ nowMs = Date.now(), limit = 50, leaseMs = 60000, ownerId = 'worker' } = {}) {
    const candidates = Object.values(this.meta.outbox)
      .filter(item => claimable(item, nowMs))
      .sort((left, right) => Number(left.created_at_ms || 0) - Number(right.created_at_ms || 0))
      .slice(0, limit);
    return candidates.map(item => {
      const claimed = claimedRow(item, { nowMs, leaseMs, ownerId });
      this.meta.outbox[item.id] = claimed;
      return clone(claimed);
    });
  }

  async assertOutboxClaim(id, claim, { nowMs = Date.now() } = {}) {
    const current = this.meta.outbox[id];
    return fenced(current, claim) && Number(current.lease_expires_at_ms || 0) > nowMs ? clone(current) : null;
  }

  async renewOutboxLease(id, claim, { nowMs = Date.now(), leaseMs = 60000 } = {}) {
    const current = this.meta.outbox[id];
    if (!fenced(current, claim) || Number(current.lease_expires_at_ms || 0) <= nowMs) return null;
    const renewed = Object.assign({}, clone(current), {
      lease_expires_at_ms: nowMs + leaseMs,
      lease_renewed_at_ms: nowMs
    });
    this.meta.outbox[id] = renewed;
    return clone(renewed);
  }

  async finishOutbox(id, claim, patch) {
    const current = this.meta.outbox[id];
    if (!fenced(current, claim)) return null;
    this.meta.outbox[id] = completedRow(current, patch);
    return clone(this.meta.outbox[id]);
  }

  async markOutbox(id, patch, claim) {
    return await this.finishOutbox(id, claim || {}, patch);
  }

  async getCanonicalForOutbox(item) {
    const employee = this.snapshot.employees[item.employee_id];
    if (!employee || employee.disabled || employee.active === false) {
      return { missing: true, canonicalKey: item.canonical_key, employeeId: item.employee_id, date: item.date || null };
    }
    if (item.entity === 'fixed_schedule') {
      const fixed = this.snapshot.fixed_schedules[item.employee_id] || null;
      return { entity: 'fixed_schedule', employeeId: item.employee_id, employee: clone(employee), row: clone(fixed), revision: revisionOf(fixed) };
    }
    const resolved = resolveCanonicalDay(this.snapshot, item.date, item.employee_id);
    return {
      entity: 'daily_override',
      canonicalKey: canonicalKey(item.date, item.employee_id),
      date: item.date,
      employeeId: item.employee_id,
      employee: clone(employee),
      state: resolved.state === 'missing' ? 'clear' : resolved.state,
      shift: clone(resolved.shift),
      source: resolved.source,
      row: clone(resolved.row),
      revision: revisionOf(resolved.row, item.canonical_revision)
    };
  }

  async getCanonicalRevision(key) {
    const parsed = String(key || '').match(/^daily\|(\d{4}-\d{2}-\d{2})\|(.+)$/);
    if (!parsed) return '';
    const resolved = resolveCanonicalDay(this.snapshot, parsed[1], parsed[2]);
    return revisionOf(resolved.row);
  }

  async getExplicitOverrideState(date, employeeId) {
    const row = this.snapshot.overrides[date] && this.snapshot.overrides[date][employeeId];
    return explicitState(row);
  }

  async writeImportedChange(change, { nowMs = Date.now(), expectedRevision = null, destinationExpectation = null } = {}) {
    if (change.action === 'move') {
      return await this.writeImportedMoveAtomic(change, {
        nowMs,
        sourceExpectedRevision: expectedRevision,
        destinationExpectation
      });
    }
    const current = this.snapshot.overrides[change.date] && this.snapshot.overrides[change.date][change.employeeId];
    if (expectedRevision != null && current && revisionOf(current) !== String(expectedRevision)) throw new EtagConflictError('Canonical override changed during Google import');
    validateMoveDestination(change, current, destinationExpectation);
    if (!this.snapshot.overrides[change.date]) this.snapshot.overrides[change.date] = {};
    if (!this.snapshot.status[change.date]) this.snapshot.status[change.date] = {};
    const row = addWriteMetadata(change.row, { nowMs, source: 'google_calendar' });
    this.snapshot.overrides[change.date][change.employeeId] = row;
    this.snapshot.status[change.date][change.employeeId] = statusForChange(change, nowMs);
    return clone(row);
  }

  async writeImportedMoveAtomic(change, {
    nowMs = Date.now(), sourceExpectedRevision = null, sourceExpectation = null, destinationExpectation = null
  } = {}) {
    const source = this.snapshot.overrides[change.priorDate] && this.snapshot.overrides[change.priorDate][change.employeeId];
    const destination = this.snapshot.overrides[change.date] && this.snapshot.overrides[change.date][change.employeeId];
    if (sameAppliedMove(change, source, destination)) {
      return clone(destination);
    }
    validateMoveSource(source, sourceExpectedRevision, sourceExpectation);
    validateMoveDestination(change, destination, destinationExpectation);
    const rows = moveRows(change, nowMs);
    const nextOverrides = clone(this.snapshot.overrides);
    const nextStatus = clone(this.snapshot.status);
    if (!nextOverrides[change.date]) nextOverrides[change.date] = {};
    if (!nextOverrides[change.priorDate]) nextOverrides[change.priorDate] = {};
    if (!nextStatus[change.date]) nextStatus[change.date] = {};
    if (!nextStatus[change.priorDate]) nextStatus[change.priorDate] = {};
    nextOverrides[change.date][change.employeeId] = rows.row;
    nextOverrides[change.priorDate][change.employeeId] = rows.clear;
    nextStatus[change.date][change.employeeId] = statusForChange(change, nowMs);
    nextStatus[change.priorDate][change.employeeId] = Object.assign(
      statusForChange({ action: 'clear', row: rows.clear }, nowMs),
      { moved_to: change.date }
    );
    this.snapshot.overrides = nextOverrides;
    this.snapshot.status = nextStatus;
    return clone(rows.row);
  }

  async getMapping(key) {
    return clone(this.meta.mappings[key] || null);
  }

  async getMappingByEventId(eventId) {
    return clone(Object.values(this.meta.mappings).find(mapping => mapping.eventId === eventId) || null);
  }

  async setMapping(key, mapping) {
    this.meta.mappings[key] = Object.assign({}, clone(mapping), { canonicalKey: key });
    return clone(this.meta.mappings[key]);
  }

  async deleteMapping(key) {
    delete this.meta.mappings[key];
  }

  async listMappings() {
    return Object.values(this.meta.mappings).map(clone);
  }

  async getSyncState() {
    return clone(this.meta.sync_state);
  }

  async setSyncState(patch) {
    Object.assign(this.meta.sync_state, clone(patch));
    return clone(this.meta.sync_state);
  }

  async putMirror(eventId, event) {
    this.meta.mirror[eventId] = clone(event);
  }

  async clearMirror() {
    this.meta.mirror = {};
  }

  async appendAudit(row) {
    const key = auditKey(row.at_ms || Date.now());
    this.meta.audits[key] = clone(row);
    return key;
  }

  async appendConflict(row) {
    const key = auditKey(row.at_ms || Date.now());
    this.meta.conflicts[key] = clone(row);
    return key;
  }

  async enqueuePullSignal(row) {
    const key = pullSignalId(row);
    if (!this.meta.pull_signals[key]) this.meta.pull_signals[key] = Object.assign({ id: key }, clone(row));
    return key;
  }

  async claimPullSignals({ nowMs = Date.now(), limit = 50, leaseMs = 60000, ownerId = 'worker' } = {}) {
    const candidates = Object.values(this.meta.pull_signals)
      .filter(item => claimable(item, nowMs))
      .sort((left, right) => Number(left.at_ms || 0) - Number(right.at_ms || 0))
      .slice(0, limit);
    return candidates.map(item => {
      const claimed = claimedRow(item, { nowMs, leaseMs, ownerId });
      this.meta.pull_signals[item.id] = claimed;
      return clone(claimed);
    });
  }

  async finishPullSignal(id, claim, patch) {
    const current = this.meta.pull_signals[id];
    if (!fenced(current, claim)) return null;
    this.meta.pull_signals[id] = completedRow(current, patch);
    return clone(this.meta.pull_signals[id]);
  }

  async getChannel() {
    return clone(this.meta.channel);
  }

  async setChannel(row) {
    this.meta.channel = clone(row);
    return clone(row);
  }

  async getOverlay(date) {
    return clone(this.meta.overlay[date] || null);
  }

  async setOverlay(date, row) {
    this.meta.overlay[date] = clone(row);
    return clone(row);
  }
}

export class FirebaseScheduleStore {
  constructor({
    databaseUrl,
    authToken = '',
    fetchImpl = fetch,
    metadataRoot = '/workschedule_v2/meta/calendar_core/google',
    overlayRoot = '/workschedule_v2/meta/calendar_overlay',
    atomicMoveWriter = null
  }) {
    if (!databaseUrl) throw new Error('FIREBASE_DATABASE_URL is required');
    this.databaseUrl = databaseUrl.replace(/\/$/, '');
    this.authToken = authToken;
    this.fetch = fetchImpl;
    this.metadataRoot = metadataRoot;
    this.overlayRoot = overlayRoot;
    this.atomicMoveWriter = typeof atomicMoveWriter === 'function' ? atomicMoveWriter : null;
  }

  url(path) {
    return this.databaseUrl + '/' + String(path || '').replace(/^\/+/, '').replace(/\/$/, '') + '.json';
  }

  headers(extra = {}) {
    return Object.assign({}, extra, this.authToken ? { Authorization: 'Bearer ' + this.authToken } : {});
  }

  async request(path, options = {}) {
    const response = await this.fetch(this.url(path), Object.assign({}, options, { headers: this.headers(options.headers) }));
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
    if (response.status === 412) throw new EtagConflictError('Firebase ETag precondition failed');
    if (!response.ok) throw new Error('Firebase HTTP ' + response.status + ' for ' + path);
    return { body, etag: response.headers.get('etag') };
  }

  async get(path) {
    return (await this.request(path)).body;
  }

  async getWithEtag(path) {
    return await this.request(path, { headers: { 'X-Firebase-ETag': 'true' } });
  }

  async put(path, value, etag = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['if-match'] = etag;
    return (await this.request(path, { method: 'PUT', headers, body: JSON.stringify(value) })).body;
  }

  async patch(path, value) {
    return (await this.request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })).body;
  }

  metaPath(suffix) {
    return this.metadataRoot + (suffix ? '/' + suffix.replace(/^\/+/, '') : '');
  }

  mappingKey(value) {
    return core.safeKey(value);
  }

  async getSnapshot() {
    const [employees, fixed, overrides, status] = await Promise.all([
      this.get('/workschedule_v2/employees'),
      this.get('/workschedule_v2/fixed_schedules'),
      this.get('/workschedule_v2/overrides'),
      this.get('/workschedule_v2/status')
    ]);
    return { employees: employees || {}, fixed_schedules: fixed || {}, overrides: overrides || {}, status: status || {} };
  }

  async enqueueOutbox(item) {
    const path = this.metaPath('outbox/' + this.mappingKey(item.id));
    const current = await this.get(path);
    if (current) return current;
    return await this.put(path, item);
  }

  async claimRows(collection, { nowMs, limit, leaseMs, ownerId, orderField }) {
    const rows = await this.get(this.metaPath(collection)) || {};
    const candidates = Object.entries(rows)
      .filter(([, item]) => claimable(item, nowMs))
      .sort(([, left], [, right]) => Number(left[orderField] || 0) - Number(right[orderField] || 0));
    const claimed = [];
    for (const [storedKey] of candidates) {
      if (claimed.length >= limit) break;
      const path = this.metaPath(collection + '/' + storedKey);
      const current = await this.getWithEtag(path);
      if (!claimable(current.body, nowMs)) continue;
      const next = claimedRow(Object.assign({}, current.body, { id: current.body.id || storedKey }), { nowMs, leaseMs, ownerId });
      try {
        await this.put(path, next, current.etag || 'null_etag');
        claimed.push(next);
      } catch (error) {
        if (!(error instanceof EtagConflictError)) throw error;
      }
    }
    return claimed;
  }

  async finishRow(collection, id, claim, patch) {
    const path = this.metaPath(collection + '/' + this.mappingKey(id));
    const current = await this.getWithEtag(path);
    if (!fenced(current.body, claim)) return null;
    const next = completedRow(current.body, patch);
    try {
      await this.put(path, next, current.etag || 'null_etag');
      return next;
    } catch (error) {
      if (error instanceof EtagConflictError) return null;
      throw error;
    }
  }

  async listPendingOutbox({ nowMs = Date.now(), limit = 50 } = {}) {
    const rows = await this.get(this.metaPath('outbox')) || {};
    return Object.values(rows)
      .filter(item => item && ['pending', 'retry'].includes(item.status) && Number(item.next_attempt_at_ms || 0) <= nowMs)
      .sort((left, right) => Number(left.created_at_ms || 0) - Number(right.created_at_ms || 0))
      .slice(0, limit);
  }

  async claimOutbox({ nowMs = Date.now(), limit = 50, leaseMs = 60000, ownerId = 'worker' } = {}) {
    return await this.claimRows('outbox', { nowMs, limit, leaseMs, ownerId, orderField: 'created_at_ms' });
  }

  async assertOutboxClaim(id, claim, { nowMs = Date.now() } = {}) {
    const current = await this.get(this.metaPath('outbox/' + this.mappingKey(id)));
    return fenced(current, claim) && Number(current.lease_expires_at_ms || 0) > nowMs ? current : null;
  }

  async renewOutboxLease(id, claim, { nowMs = Date.now(), leaseMs = 60000 } = {}) {
    const path = this.metaPath('outbox/' + this.mappingKey(id));
    const current = await this.getWithEtag(path);
    if (!fenced(current.body, claim) || Number(current.body.lease_expires_at_ms || 0) <= nowMs) return null;
    const next = Object.assign({}, current.body, {
      lease_expires_at_ms: nowMs + leaseMs,
      lease_renewed_at_ms: nowMs
    });
    try {
      await this.put(path, next, current.etag || 'null_etag');
      return next;
    } catch (error) {
      if (error instanceof EtagConflictError) return null;
      throw error;
    }
  }

  async finishOutbox(id, claim, patch) {
    return await this.finishRow('outbox', id, claim, patch);
  }

  async markOutbox(id, patch, claim) {
    return await this.finishOutbox(id, claim || {}, patch);
  }

  async getCanonicalForOutbox(item) {
    const employee = await this.get('/workschedule_v2/employees/' + item.employee_id);
    if (!employee || employee.disabled || employee.active === false) return { missing: true, canonicalKey: item.canonical_key };
    if (item.entity === 'fixed_schedule') {
      const fixed = await this.get('/workschedule_v2/fixed_schedules/' + item.employee_id);
      return { entity: 'fixed_schedule', employeeId: item.employee_id, employee, row: fixed, revision: revisionOf(fixed) };
    }
    const [row, fixed] = await Promise.all([
      this.get('/workschedule_v2/overrides/' + item.date + '/' + item.employee_id),
      this.get('/workschedule_v2/fixed_schedules/' + item.employee_id)
    ]);
    const snapshot = { employees: { [item.employee_id]: employee }, fixed_schedules: { [item.employee_id]: fixed }, overrides: { [item.date]: { [item.employee_id]: row } } };
    const resolved = resolveCanonicalDay(snapshot, item.date, item.employee_id);
    return {
      entity: 'daily_override', canonicalKey: canonicalKey(item.date, item.employee_id), date: item.date,
      employeeId: item.employee_id, employee, state: resolved.state === 'missing' ? 'clear' : resolved.state,
      shift: resolved.shift, source: resolved.source, row: resolved.row, revision: revisionOf(resolved.row, item.canonical_revision)
    };
  }

  async getCanonicalRevision(key) {
    const match = String(key || '').match(/^daily\|(\d{4}-\d{2}-\d{2})\|(.+)$/);
    if (!match) return '';
    const [employee, row, fixed] = await Promise.all([
      this.get('/workschedule_v2/employees/' + match[2]),
      this.get('/workschedule_v2/overrides/' + match[1] + '/' + match[2]),
      this.get('/workschedule_v2/fixed_schedules/' + match[2])
    ]);
    const resolved = resolveCanonicalDay({
      employees: { [match[2]]: employee },
      fixed_schedules: { [match[2]]: fixed },
      overrides: { [match[1]]: { [match[2]]: row } }
    }, match[1], match[2]);
    return revisionOf(resolved.row);
  }

  async getExplicitOverrideState(date, employeeId) {
    return explicitState(await this.get('/workschedule_v2/overrides/' + date + '/' + employeeId));
  }

  async writeImportedChange(change, { nowMs = Date.now(), expectedRevision = null, destinationExpectation = null } = {}) {
    if (change.action === 'move') {
      return await this.writeImportedMoveAtomic(change, {
        nowMs,
        sourceExpectedRevision: expectedRevision,
        destinationExpectation
      });
    }
    const path = '/workschedule_v2/overrides/' + change.date + '/' + change.employeeId;
    const current = await this.getWithEtag(path);
    if (expectedRevision != null && current.body && revisionOf(current.body) !== String(expectedRevision)) throw new EtagConflictError('Canonical override changed during Google import');
    validateMoveDestination(change, current.body, destinationExpectation);
    const row = addWriteMetadata(change.row, { nowMs, source: 'google_calendar' });
    await this.put(path, row, current.etag || 'null_etag');
    await this.put('/workschedule_v2/status/' + change.date + '/' + change.employeeId, statusForChange(change, nowMs));
    return row;
  }

  async writeImportedMoveAtomic(change, {
    nowMs = Date.now(), sourceExpectedRevision = null, sourceExpectation = null, destinationExpectation = null
  } = {}) {
    if (!this.atomicMoveWriter) throw new AtomicMoveUnavailableError();
    const rows = await this.atomicMoveWriter({
      change: clone(change), nowMs, sourceExpectedRevision, sourceExpectation: clone(sourceExpectation),
      destinationExpectation: clone(destinationExpectation)
    });
    if (!rows || !rows.row || !rows.clear) throw new AtomicMoveUnavailableError('Atomic move writer returned no committed rows');
    try {
      await this.put('/workschedule_v2/status/' + change.date + '/' + change.employeeId, statusForChange(change, nowMs));
      await this.put(
        '/workschedule_v2/status/' + change.priorDate + '/' + change.employeeId,
        Object.assign(statusForChange({ action: 'clear', row: rows.clear }, nowMs), { moved_to: change.date })
      );
    } catch (error) {
      await this.appendAudit({
        schema_version: 'workschedule.calendar_sync.audit.v1',
        action: 'atomic_move_status_retry_needed',
        event_id: change.row.google_event_id || '',
        prior_date: change.priorDate,
        date: change.date,
        at_ms: nowMs,
        error: String(error && (error.code || error.message) || 'status_write_failed').slice(0, 200)
      });
      throw error;
    }
    return clone(rows.row);
  }

  async getMapping(key) {
    return await this.get(this.metaPath('mappings/' + this.mappingKey(key)));
  }

  async getMappingByEventId(eventId) {
    const mappings = await this.get(this.metaPath('mappings')) || {};
    return Object.values(mappings).find(mapping => mapping && mapping.eventId === eventId) || null;
  }

  async setMapping(key, mapping) {
    return await this.put(this.metaPath('mappings/' + this.mappingKey(key)), Object.assign({}, mapping, { canonicalKey: key }));
  }

  async deleteMapping(key) {
    return await this.put(this.metaPath('mappings/' + this.mappingKey(key)), null);
  }

  async listMappings() {
    return Object.values(await this.get(this.metaPath('mappings')) || {}).filter(Boolean);
  }

  async getSyncState() { return await this.get(this.metaPath('sync_state')) || {}; }
  async setSyncState(patch) { await this.patch(this.metaPath('sync_state'), patch); return patch; }
  async putMirror(eventId, event) { return await this.put(this.metaPath('mirror/' + this.mappingKey(eventId)), event); }
  async clearMirror() { return await this.put(this.metaPath('mirror'), null); }
  async appendAudit(row) { const key = auditKey(row.at_ms || Date.now()); await this.put(this.metaPath('audit/' + key), row); return key; }
  async appendConflict(row) { const key = auditKey(row.at_ms || Date.now()); await this.put(this.metaPath('conflicts/' + key), row); return key; }
  async enqueuePullSignal(row) {
    const key = pullSignalId(row);
    const path = this.metaPath('pull_signals/' + key);
    const current = await this.getWithEtag(path);
    if (current.body) return key;
    try {
      await this.put(path, Object.assign({ id: key }, row), current.etag || 'null_etag');
    } catch (error) {
      if (!(error instanceof EtagConflictError)) throw error;
    }
    return key;
  }
  async claimPullSignals({ nowMs = Date.now(), limit = 50, leaseMs = 60000, ownerId = 'worker' } = {}) {
    return await this.claimRows('pull_signals', { nowMs, limit, leaseMs, ownerId, orderField: 'at_ms' });
  }
  async finishPullSignal(id, claim, patch) {
    return await this.finishRow('pull_signals', id, claim, patch);
  }
  async getChannel() { return await this.get(this.metaPath('channel')); }
  async setChannel(row) { return await this.put(this.metaPath('channel'), row); }
  async getOverlay(date) { return await this.get(this.overlayRoot + '/' + date); }
  async setOverlay(date, row) { return await this.put(this.overlayRoot + '/' + date, row); }
}
