import crypto from 'node:crypto';
import {
  AtomicImportUnavailableError,
  DestinationCollisionError,
  EtagConflictError,
  MappingGuardRequiredError,
  SourceRevisionConflictError,
  StaleFenceError,
  StaleGoogleEventError
} from './errors.mjs';
import { addWriteMetadata, canonicalKey, revisionOf, resolveCanonicalDay } from './domain.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../docs/calendar_core_logic.js');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
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
  const eventEtag = String(change.row && change.row.google_etag || '');
  return !!eventId
    && String(destination && destination.google_event_id || '') === eventId
    && String(source && source.google_event_id || '') === eventId
    && String(destination && destination.google_etag || '') === eventEtag
    && String(source && source.google_etag || '') === eventEtag
    && (source && (source.clear === true || String(source.state || source.status || source.type || '').toLowerCase() === 'clear'));
}

function googleMetadata(root) {
  return root && root.meta && root.meta.calendar_core && root.meta.calendar_core.google || {};
}

function guardRow(metadata, guard) {
  if (!guard || !guard.claim) return null;
  if (guard.kind === 'pull') return metadata.pull_lease || null;
  if (guard.kind === 'outbox') return metadata.outbox && metadata.outbox[core.safeKey(guard.id)] || null;
  return null;
}

function assertGuard(metadata, guard, nowMs) {
  if (!guard || !guard.claim) throw new MappingGuardRequiredError();
  const current = guardRow(metadata || {}, guard);
  if (!fenced(current, guard.claim) || Number(current.lease_expires_at_ms || 0) <= nowMs) throw new StaleFenceError();
  return current;
}

function ensureDateMap(container, date) {
  if (!container[date] || typeof container[date] !== 'object' || Array.isArray(container[date])) container[date] = {};
  return container[date];
}

function statusMatchesEvent(status, change) {
  return String(status && status.google_event_id || '') === String(change.row && change.row.google_event_id || '')
    && String(status && status.google_etag || '') === String(change.row && change.row.google_etag || '');
}

function applyAtomicImport(rootValue, {
  change,
  nowMs,
  expectedCanonicalRevision,
  sourceExpectation,
  destinationExpectation,
  guard
}) {
  const current = rootValue && typeof rootValue === 'object' ? rootValue : {};
  assertGuard(googleMetadata(current), guard, nowMs);
  const sourceDate = change.priorDate || change.date;
  const resolved = resolveCanonicalDay(current, sourceDate, change.employeeId);
  const currentRevision = revisionOf(resolved.row);
  const source = current.overrides && current.overrides[sourceDate] && current.overrides[sourceDate][change.employeeId];
  const destination = current.overrides && current.overrides[change.date] && current.overrides[change.date][change.employeeId];
  const currentStatus = current.status && current.status[change.date] && current.status[change.date][change.employeeId];
  const currentSourceStatus = current.status && current.status[sourceDate] && current.status[sourceDate][change.employeeId];
  const sameEventAtDestination = String(destination && destination.google_event_id || '') === String(change.row && change.row.google_event_id || '')
    && String(destination && destination.google_etag || '') === String(change.row && change.row.google_etag || '');
  const idempotentMove = change.action === 'move' && sameAppliedMove(change, source, destination);
  const idempotentSameDate = change.action !== 'move' && sameEventAtDestination;

  if (!idempotentMove && !idempotentSameDate && String(currentRevision) !== String(expectedCanonicalRevision)) {
    throw new SourceRevisionConflictError();
  }
  if (change.action === 'move' && !idempotentMove) {
    if (sourceExpectation) {
      if (sourceExpectation.exists !== (source != null)) throw new SourceRevisionConflictError();
      if (source && sourceExpectation.revision != null && revisionOf(source) !== String(sourceExpectation.revision)) {
        throw new SourceRevisionConflictError();
      }
    }
    validateMoveDestination(change, destination, destinationExpectation);
  }

  const next = clone(current);
  if (!next.overrides || typeof next.overrides !== 'object' || Array.isArray(next.overrides)) next.overrides = {};
  if (!next.status || typeof next.status !== 'object' || Array.isArray(next.status)) next.status = {};
  let rows;
  if (idempotentMove) {
    rows = { row: clone(destination), clear: clone(source), idempotent: true };
  } else if (change.action === 'move') {
    rows = moveRows(change, nowMs);
    ensureDateMap(next.overrides, change.date)[change.employeeId] = rows.row;
    ensureDateMap(next.overrides, sourceDate)[change.employeeId] = rows.clear;
  } else {
    const row = idempotentSameDate ? clone(destination) : addWriteMetadata(change.row, { nowMs, source: 'google_calendar' });
    rows = { row, clear: null, idempotent: idempotentSameDate };
    ensureDateMap(next.overrides, change.date)[change.employeeId] = row;
  }
  if (!statusMatchesEvent(currentStatus, change) || !rows.idempotent) {
    ensureDateMap(next.status, change.date)[change.employeeId] = statusForChange(change, nowMs);
  }
  if (change.action === 'move') {
    const sourceStatusChange = { action: 'clear', row: rows.clear };
    if (!rows.idempotent || !statusMatchesEvent(currentSourceStatus, sourceStatusChange)
      || String(currentSourceStatus && currentSourceStatus.moved_to || '') !== String(change.date)) {
      ensureDateMap(next.status, sourceDate)[change.employeeId] = Object.assign(
        statusForChange(sourceStatusChange, nowMs),
        { moved_to: change.date }
      );
    }
  }
  return { next, rows };
}

function compareGoogleUpdated(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs < bMs ? -1 : 1;
  return a < b ? -1 : 1;
}

function mappingFingerprint(mapping) {
  const source = mapping || {};
  return JSON.stringify({
    eventId: source.eventId || '', googleEtag: source.googleEtag || '', googleUpdated: source.googleUpdated || '',
    canonicalRevision: source.canonicalRevision || '', employeeId: source.employeeId || '', date: source.date || '',
    source: source.source || '', tombstone: source.tombstone === true
  });
}

function mappingEtag(mapping) {
  return String(mapping && mapping.cas_etag || 'null_etag');
}

function validateMappingSet(current, next, guard) {
  if (!current) return;
  const order = compareGoogleUpdated(next && next.googleUpdated, current.googleUpdated);
  if (order < 0) throw new StaleGoogleEventError();
  if (order === 0 && mappingFingerprint(current) !== mappingFingerprint(next) && guard && guard.kind === 'pull') {
    const error = new EtagConflictError('Equal Google updated timestamps have different mapping payloads');
    error.code = 'equal_google_updated_ambiguity';
    throw error;
  }
}

function applyMappingOperation(metadataValue, operation, nowMs) {
  const metadata = metadataValue && typeof metadataValue === 'object' ? metadataValue : {};
  assertGuard(metadata, operation.guard, nowMs);
  const mappings = metadata.mappings && typeof metadata.mappings === 'object' ? metadata.mappings : {};
  const nextMetadata = clone(metadata);
  if (!nextMetadata.mappings || typeof nextMetadata.mappings !== 'object') nextMetadata.mappings = {};
  const key = core.safeKey(operation.key || operation.toKey || '');
  const current = mappings[key] || null;
  if (operation.type === 'move') {
    const fromKey = core.safeKey(operation.fromKey);
    const source = mappings[fromKey] || null;
    if (mappingEtag(source) !== String(operation.expectedFromEtag || 'null_etag')) throw new EtagConflictError('Mapping source CAS mismatch');
    if (mappingEtag(current) !== String(operation.expectedToEtag || 'null_etag')) throw new EtagConflictError('Mapping destination CAS mismatch');
    validateMappingSet(source, operation.value, operation.guard);
    validateMappingSet(current, operation.value, operation.guard);
    delete nextMetadata.mappings[fromKey];
  } else if (mappingEtag(current) !== String(operation.expectedEtag || 'null_etag')) {
    throw new EtagConflictError('Mapping CAS mismatch');
  }
  if (operation.type === 'delete') {
    delete nextMetadata.mappings[key];
    return { nextMetadata, value: null };
  }
  validateMappingSet(current, operation.value, operation.guard);
  const value = Object.assign({}, clone(operation.value), {
    canonicalKey: operation.key || operation.toKey,
    cas_etag: operation.nextEtag,
    mapping_guard_kind: operation.guard.kind,
    mapping_guard_owner: operation.guard.claim.lease_owner,
    mapping_guard_epoch: operation.guard.claim.lease_epoch,
    mapping_written_at_ms: nowMs
  });
  nextMetadata.mappings[key] = value;
  return { nextMetadata, value };
}

export function createFirebaseAdminAtomicImportWriter(database) {
  if (!database || typeof database.ref !== 'function') throw new AtomicImportUnavailableError('Firebase Admin database.ref is required');
  return async function writeAtomicImport(options) {
    const input = Object.assign({}, options, {
      nowMs: Number.isFinite(options && options.nowMs) ? options.nowMs : Date.now()
    });
    const ref = database.ref('/workschedule_v2');
    let blocked = null;
    let committedRows = null;
    const result = await ref.transaction(current => {
      try {
        const applied = applyAtomicImport(current, input);
        committedRows = applied.rows;
        return applied.next;
      } catch (error) {
        blocked = error;
        return undefined;
      }
    }, undefined, false);
    if (!result || result.committed !== true) throw blocked || new AtomicImportUnavailableError('Atomic import transaction aborted');
    return clone(committedRows);
  };
}

export function createFirebaseAdminAtomicMoveWriter(database) {
  return createFirebaseAdminAtomicImportWriter(database);
}

export function createFirebaseAdminMappingCasWriter(database) {
  if (!database || typeof database.ref !== 'function') throw new MappingGuardRequiredError('Firebase Admin database.ref is required');
  return async function writeMappingCas(operation) {
    const nowMs = Number.isFinite(operation && operation.nowMs) ? operation.nowMs : Date.now();
    const ref = database.ref('/workschedule_v2/meta/calendar_core/google');
    const nextEtag = operation.nextEtag || crypto.randomUUID();
    let blocked = null;
    let committedValue = null;
    const result = await ref.transaction(current => {
      try {
        const applied = applyMappingOperation(current, Object.assign({}, operation, { nextEtag, nowMs }), nowMs);
        committedValue = applied.value;
        return applied.nextMetadata;
      } catch (error) {
        blocked = error;
        return undefined;
      }
    }, undefined, false);
    if (!result || result.committed !== true) throw blocked || new EtagConflictError('Mapping transaction aborted');
    return clone(committedValue);
  };
}

export class MemorySyncStore {
  constructor(snapshot = {}) {
    this.snapshot = clone(snapshot || {});
    for (const key of ['employees', 'fixed_schedules', 'overrides', 'status', 'attendance']) {
      if (this.snapshot[key] == null) this.snapshot[key] = {};
    }
    this.meta = {
      outbox: {}, mappings: {}, mirror: {}, sync_state: {}, audits: {}, conflicts: {}, pull_signals: {},
      pull_lease: null, channel: null, overlay: {}
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

  async claimPullLease({ nowMs = Date.now(), leaseMs = 60000, ownerId = 'worker' } = {}) {
    const current = this.meta.pull_lease;
    if (current && current.status === 'running' && Number(current.lease_expires_at_ms || 0) > nowMs) return null;
    const claimed = claimedRow(Object.assign({ status: 'pending', lease_epoch: 0 }, current || {}), { nowMs, leaseMs, ownerId });
    this.meta.pull_lease = claimed;
    return clone(claimed);
  }

  async assertPullLease(claim, { nowMs = Date.now() } = {}) {
    const current = this.meta.pull_lease;
    return fenced(current, claim) && Number(current.lease_expires_at_ms || 0) > nowMs ? clone(current) : null;
  }

  async renewPullLease(claim, { nowMs = Date.now(), leaseMs = 60000 } = {}) {
    const current = this.meta.pull_lease;
    if (!fenced(current, claim) || Number(current.lease_expires_at_ms || 0) <= nowMs) return null;
    this.meta.pull_lease = Object.assign({}, current, { lease_expires_at_ms: nowMs + leaseMs, lease_renewed_at_ms: nowMs });
    return clone(this.meta.pull_lease);
  }

  async releasePullLease(claim, { nowMs = Date.now() } = {}) {
    const current = this.meta.pull_lease;
    if (!fenced(current, claim)) return null;
    this.meta.pull_lease = completedRow(current, { status: 'idle', released_at_ms: nowMs });
    return clone(this.meta.pull_lease);
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

  async writeImportedAtomic(change, options = {}) {
    const root = clone(this.snapshot);
    if (!root.meta || typeof root.meta !== 'object' || Array.isArray(root.meta)) root.meta = {};
    if (!root.meta.calendar_core || typeof root.meta.calendar_core !== 'object' || Array.isArray(root.meta.calendar_core)) {
      root.meta.calendar_core = {};
    }
    root.meta.calendar_core.google = clone(this.meta);
    const applied = applyAtomicImport(root, Object.assign({}, options, { change }));
    const nextSnapshot = clone(applied.next);
    delete nextSnapshot.meta.calendar_core.google;
    if (!Object.keys(nextSnapshot.meta.calendar_core).length) delete nextSnapshot.meta.calendar_core;
    if (!Object.keys(nextSnapshot.meta).length) delete nextSnapshot.meta;
    this.snapshot = nextSnapshot;
    return clone(applied.rows.row);
  }

  async writeImportedChange(change, options = {}) { return await this.writeImportedAtomic(change, options); }
  async writeImportedMoveAtomic(change, options = {}) { return await this.writeImportedAtomic(change, options); }

  async getMapping(key) {
    return clone(this.meta.mappings[core.safeKey(key)] || null);
  }

  async getMappingByEventId(eventId) {
    return clone(Object.values(this.meta.mappings).find(mapping => mapping.eventId === eventId) || null);
  }

  async casSetMapping(key, mapping, { expectedEtag = 'null_etag', guard, nowMs = Date.now() } = {}) {
    const operation = { type: 'set', key, value: mapping, expectedEtag, guard, nowMs, nextEtag: crypto.randomUUID() };
    const applied = applyMappingOperation(this.meta, operation, nowMs);
    this.meta = Object.assign(this.meta, applied.nextMetadata);
    return clone(applied.value);
  }

  async casDeleteMapping(key, { expectedEtag = 'null_etag', guard, nowMs = Date.now() } = {}) {
    const applied = applyMappingOperation(this.meta, { type: 'delete', key, expectedEtag, guard, nowMs }, nowMs);
    this.meta = Object.assign(this.meta, applied.nextMetadata);
    return null;
  }

  async casMoveMapping(fromKey, toKey, mapping, {
    expectedFromEtag = 'null_etag', expectedToEtag = 'null_etag', guard, nowMs = Date.now()
  } = {}) {
    const operation = {
      type: 'move', fromKey, toKey, value: mapping, expectedFromEtag, expectedToEtag,
      guard, nowMs, nextEtag: crypto.randomUUID()
    };
    const applied = applyMappingOperation(this.meta, operation, nowMs);
    this.meta = Object.assign(this.meta, applied.nextMetadata);
    return clone(applied.value);
  }

  async setMapping() { throw new MappingGuardRequiredError(); }
  async deleteMapping() { throw new MappingGuardRequiredError(); }

  async listMappings() {
    return Object.values(this.meta.mappings).map(clone);
  }

  async getSyncState() {
    return clone(this.meta.sync_state);
  }

  async setSyncState(patch, { guard, nowMs = Date.now() } = {}) {
    assertGuard(this.meta, guard, nowMs);
    Object.assign(this.meta.sync_state, clone(patch));
    return clone(this.meta.sync_state);
  }

  async getMirror(eventId) { return clone(this.meta.mirror[eventId] || null); }

  async putMirror(eventId, event, { guard, nowMs = Date.now() } = {}) {
    assertGuard(this.meta, guard, nowMs);
    const current = this.meta.mirror[eventId];
    const order = compareGoogleUpdated(event && event.updated, current && current.updated);
    if (current && order < 0) throw new StaleGoogleEventError('Mirror update is stale');
    if (current && order === 0 && stableJson(current) !== stableJson(event)) {
      const error = new EtagConflictError('Equal Google updated timestamps have different mirror payloads or ETags');
      error.code = 'equal_google_updated_ambiguity';
      throw error;
    }
    this.meta.mirror[eventId] = clone(event);
  }

  async clearMirror({ guard, nowMs = Date.now() } = {}) {
    assertGuard(this.meta, guard, nowMs);
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

  async renewPullSignal(id, claim, { nowMs = Date.now(), leaseMs = 60000 } = {}) {
    const current = this.meta.pull_signals[id];
    if (!fenced(current, claim) || Number(current.lease_expires_at_ms || 0) <= nowMs) return null;
    this.meta.pull_signals[id] = Object.assign({}, current, { lease_expires_at_ms: nowMs + leaseMs, lease_renewed_at_ms: nowMs });
    return clone(this.meta.pull_signals[id]);
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
    atomicImportWriter = null,
    atomicMoveWriter = null,
    mappingCasWriter = null,
    requestTimeoutMs = 15000
  }) {
    if (!databaseUrl) throw new Error('FIREBASE_DATABASE_URL is required');
    this.databaseUrl = databaseUrl.replace(/\/$/, '');
    this.authToken = authToken;
    this.fetch = fetchImpl;
    this.metadataRoot = metadataRoot;
    this.overlayRoot = overlayRoot;
    this.atomicImportWriter = typeof atomicImportWriter === 'function'
      ? atomicImportWriter
      : typeof atomicMoveWriter === 'function' ? atomicMoveWriter : null;
    this.mappingCasWriter = typeof mappingCasWriter === 'function' ? mappingCasWriter : null;
    this.requestTimeoutMs = Math.max(1000, Number(requestTimeoutMs) || 15000);
  }

  url(path) {
    return this.databaseUrl + '/' + String(path || '').replace(/^\/+/, '').replace(/\/$/, '') + '.json';
  }

  headers(extra = {}) {
    return Object.assign({}, extra, this.authToken ? { Authorization: 'Bearer ' + this.authToken } : {});
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let response;
    let text;
    try {
      response = await this.fetch(this.url(path), Object.assign({}, options, {
        headers: this.headers(options.headers), signal: controller.signal
      }));
      text = await response.text();
    } catch (error) {
      if (controller.signal.aborted || error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        const timeout = new Error('Firebase REST request timed out for ' + path);
        timeout.code = 'firebase_timeout';
        timeout.retryable = true;
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
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

  guardPath(guard) {
    if (guard && guard.kind === 'pull') return this.metaPath('pull_lease');
    if (guard && guard.kind === 'outbox') return this.metaPath('outbox/' + this.mappingKey(guard.id));
    return '';
  }

  async assertGuardCurrent(guard, nowMs = Date.now()) {
    const path = this.guardPath(guard);
    if (!path) throw new MappingGuardRequiredError();
    const current = await this.get(path);
    if (!fenced(current, guard.claim) || Number(current.lease_expires_at_ms || 0) <= nowMs) throw new StaleFenceError();
    return current;
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

  async claimPullLease({ nowMs = Date.now(), leaseMs = 60000, ownerId = 'worker' } = {}) {
    const path = this.metaPath('pull_lease');
    const current = await this.getWithEtag(path);
    if (current.body && current.body.status === 'running' && Number(current.body.lease_expires_at_ms || 0) > nowMs) return null;
    const claimed = claimedRow(Object.assign({ status: 'pending', lease_epoch: 0 }, current.body || {}), { nowMs, leaseMs, ownerId });
    try {
      await this.put(path, claimed, current.etag || 'null_etag');
      return claimed;
    } catch (error) {
      if (error instanceof EtagConflictError) return null;
      throw error;
    }
  }

  async assertPullLease(claim, { nowMs = Date.now() } = {}) {
    const current = await this.get(this.metaPath('pull_lease'));
    return fenced(current, claim) && Number(current.lease_expires_at_ms || 0) > nowMs ? current : null;
  }

  async renewPullLease(claim, { nowMs = Date.now(), leaseMs = 60000 } = {}) {
    const path = this.metaPath('pull_lease');
    const current = await this.getWithEtag(path);
    if (!fenced(current.body, claim) || Number(current.body.lease_expires_at_ms || 0) <= nowMs) return null;
    const renewed = Object.assign({}, current.body, { lease_expires_at_ms: nowMs + leaseMs, lease_renewed_at_ms: nowMs });
    try {
      await this.put(path, renewed, current.etag || 'null_etag');
      return renewed;
    } catch (error) {
      if (error instanceof EtagConflictError) return null;
      throw error;
    }
  }

  async releasePullLease(claim, { nowMs = Date.now() } = {}) {
    const path = this.metaPath('pull_lease');
    const current = await this.getWithEtag(path);
    if (!fenced(current.body, claim)) return null;
    const released = completedRow(current.body, { status: 'idle', released_at_ms: nowMs });
    try {
      await this.put(path, released, current.etag || 'null_etag');
      return released;
    } catch (error) {
      if (error instanceof EtagConflictError) return null;
      throw error;
    }
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

  async writeImportedAtomic(change, options = {}) {
    if (!this.atomicImportWriter) throw new AtomicImportUnavailableError();
    const rows = await this.atomicImportWriter(Object.assign({}, clone(options), { change: clone(change) }));
    if (!rows || !rows.row) throw new AtomicImportUnavailableError('Atomic import writer returned no committed row');
    return clone(rows.row);
  }

  async writeImportedChange(change, options = {}) { return await this.writeImportedAtomic(change, options); }
  async writeImportedMoveAtomic(change, options = {}) { return await this.writeImportedAtomic(change, options); }

  async getMapping(key) {
    return await this.get(this.metaPath('mappings/' + this.mappingKey(key)));
  }

  async getMappingByEventId(eventId) {
    const mappings = await this.get(this.metaPath('mappings')) || {};
    return Object.values(mappings).find(mapping => mapping && mapping.eventId === eventId) || null;
  }

  async casSetMapping(key, mapping, { expectedEtag = 'null_etag', guard, nowMs = Date.now() } = {}) {
    if (!this.mappingCasWriter) throw new MappingGuardRequiredError('Firebase Admin mapping CAS writer is not configured');
    return await this.mappingCasWriter({ type: 'set', key, value: clone(mapping), expectedEtag, guard: clone(guard), nowMs });
  }

  async casDeleteMapping(key, { expectedEtag = 'null_etag', guard, nowMs = Date.now() } = {}) {
    if (!this.mappingCasWriter) throw new MappingGuardRequiredError('Firebase Admin mapping CAS writer is not configured');
    return await this.mappingCasWriter({ type: 'delete', key, expectedEtag, guard: clone(guard), nowMs });
  }

  async casMoveMapping(fromKey, toKey, mapping, {
    expectedFromEtag = 'null_etag', expectedToEtag = 'null_etag', guard, nowMs = Date.now()
  } = {}) {
    if (!this.mappingCasWriter) throw new MappingGuardRequiredError('Firebase Admin mapping CAS writer is not configured');
    return await this.mappingCasWriter({
      type: 'move', fromKey, toKey, value: clone(mapping), expectedFromEtag, expectedToEtag,
      guard: clone(guard), nowMs
    });
  }

  async setMapping() { throw new MappingGuardRequiredError(); }
  async deleteMapping() { throw new MappingGuardRequiredError(); }

  async listMappings() {
    return Object.values(await this.get(this.metaPath('mappings')) || {}).filter(Boolean);
  }

  async getSyncState() { return await this.get(this.metaPath('sync_state')) || {}; }
  async setSyncState(patch, { guard, nowMs = Date.now() } = {}) {
    await this.assertGuardCurrent(guard, nowMs);
    const path = this.metaPath('sync_state');
    const current = await this.getWithEtag(path);
    const next = Object.assign({}, current.body || {}, clone(patch));
    await this.put(path, next, current.etag || 'null_etag');
    return next;
  }
  async getMirror(eventId) { return await this.get(this.metaPath('mirror/' + this.mappingKey(eventId))); }
  async putMirror(eventId, event, { guard, nowMs = Date.now() } = {}) {
    await this.assertGuardCurrent(guard, nowMs);
    const path = this.metaPath('mirror/' + this.mappingKey(eventId));
    const current = await this.getWithEtag(path);
    const order = compareGoogleUpdated(event && event.updated, current.body && current.body.updated);
    if (current.body && order < 0) throw new StaleGoogleEventError('Mirror update is stale');
    if (current.body && order === 0 && stableJson(current.body) !== stableJson(event)) {
      const error = new EtagConflictError('Equal Google updated timestamps have different mirror payloads or ETags');
      error.code = 'equal_google_updated_ambiguity';
      throw error;
    }
    return await this.put(path, event, current.etag || 'null_etag');
  }
  async clearMirror({ guard, nowMs = Date.now() } = {}) {
    await this.assertGuardCurrent(guard, nowMs);
    const path = this.metaPath('mirror');
    const current = await this.getWithEtag(path);
    return await this.put(path, null, current.etag || 'null_etag');
  }
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
  async renewPullSignal(id, claim, { nowMs = Date.now(), leaseMs = 60000 } = {}) {
    const path = this.metaPath('pull_signals/' + this.mappingKey(id));
    const current = await this.getWithEtag(path);
    if (!fenced(current.body, claim) || Number(current.body.lease_expires_at_ms || 0) <= nowMs) return null;
    const renewed = Object.assign({}, current.body, { lease_expires_at_ms: nowMs + leaseMs, lease_renewed_at_ms: nowMs });
    try {
      await this.put(path, renewed, current.etag || 'null_etag');
      return renewed;
    } catch (error) {
      if (error instanceof EtagConflictError) return null;
      throw error;
    }
  }
  async finishPullSignal(id, claim, patch) {
    return await this.finishRow('pull_signals', id, claim, patch);
  }
  async getChannel() { return await this.get(this.metaPath('channel')); }
  async setChannel(row) { return await this.put(this.metaPath('channel'), row); }
  async getOverlay(date) { return await this.get(this.overlayRoot + '/' + date); }
  async setOverlay(date, row) { return await this.put(this.overlayRoot + '/' + date, row); }
}
