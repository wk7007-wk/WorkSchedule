import crypto from 'node:crypto';
import { EtagConflictError } from './errors.mjs';
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

  async markOutbox(id, patch) {
    if (!this.meta.outbox[id]) return null;
    Object.assign(this.meta.outbox[id], clone(patch));
    return clone(this.meta.outbox[id]);
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

  async writeImportedChange(change, { nowMs = Date.now(), expectedRevision = null } = {}) {
    const current = this.snapshot.overrides[change.date] && this.snapshot.overrides[change.date][change.employeeId];
    if (expectedRevision != null && current && revisionOf(current) !== String(expectedRevision)) throw new EtagConflictError('Canonical override changed during Google import');
    if (!this.snapshot.overrides[change.date]) this.snapshot.overrides[change.date] = {};
    if (!this.snapshot.status[change.date]) this.snapshot.status[change.date] = {};
    const row = addWriteMetadata(change.row, { nowMs, source: 'google_calendar' });
    this.snapshot.overrides[change.date][change.employeeId] = row;
    this.snapshot.status[change.date][change.employeeId] = statusForChange(change, nowMs);
    if (change.action === 'move' && change.priorDate && change.priorDate !== change.date) {
      if (!this.snapshot.overrides[change.priorDate]) this.snapshot.overrides[change.priorDate] = {};
      if (!this.snapshot.status[change.priorDate]) this.snapshot.status[change.priorDate] = {};
      const clear = addWriteMetadata({
        state: 'clear', type: 'clear', shift: null, start: '', end: '', role: '', work: false, active: false,
        off: false, dayoff: false, clear: true, google_event_id: change.row.google_event_id || '', google_etag: change.row.google_etag || ''
      }, { nowMs, source: 'google_calendar' });
      this.snapshot.overrides[change.priorDate][change.employeeId] = clear;
      this.snapshot.status[change.priorDate][change.employeeId] = Object.assign(statusForChange({ action: 'clear', row: clear }, nowMs), { moved_to: change.date });
    }
    return clone(row);
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
    const key = auditKey(row.at_ms || Date.now());
    this.meta.pull_signals[key] = clone(row);
    return key;
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
  constructor({ databaseUrl, authToken = '', fetchImpl = fetch, metadataRoot = '/workschedule_v2/meta/calendar_core/google', overlayRoot = '/workschedule_v2/meta/calendar_overlay' }) {
    if (!databaseUrl) throw new Error('FIREBASE_DATABASE_URL is required');
    this.databaseUrl = databaseUrl.replace(/\/$/, '');
    this.authToken = authToken;
    this.fetch = fetchImpl;
    this.metadataRoot = metadataRoot;
    this.overlayRoot = overlayRoot;
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

  async listPendingOutbox({ nowMs = Date.now(), limit = 50 } = {}) {
    const rows = await this.get(this.metaPath('outbox')) || {};
    return Object.values(rows)
      .filter(item => item && ['pending', 'retry'].includes(item.status) && Number(item.next_attempt_at_ms || 0) <= nowMs)
      .sort((left, right) => Number(left.created_at_ms || 0) - Number(right.created_at_ms || 0))
      .slice(0, limit);
  }

  async markOutbox(id, patch) {
    await this.patch(this.metaPath('outbox/' + this.mappingKey(id)), patch);
    return patch;
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

  async writeImportedChange(change, { nowMs = Date.now(), expectedRevision = null } = {}) {
    const path = '/workschedule_v2/overrides/' + change.date + '/' + change.employeeId;
    const current = await this.getWithEtag(path);
    if (expectedRevision != null && current.body && revisionOf(current.body) !== String(expectedRevision)) throw new EtagConflictError('Canonical override changed during Google import');
    const row = addWriteMetadata(change.row, { nowMs, source: 'google_calendar' });
    await this.put(path, row, current.etag || 'null_etag');
    await this.put('/workschedule_v2/status/' + change.date + '/' + change.employeeId, statusForChange(change, nowMs));
    if (change.action === 'move' && change.priorDate && change.priorDate !== change.date) {
      const priorPath = '/workschedule_v2/overrides/' + change.priorDate + '/' + change.employeeId;
      const prior = await this.getWithEtag(priorPath);
      const clear = addWriteMetadata({
        state: 'clear', type: 'clear', shift: null, start: '', end: '', role: '', work: false, active: false,
        off: false, dayoff: false, clear: true, google_event_id: change.row.google_event_id || '', google_etag: change.row.google_etag || ''
      }, { nowMs, source: 'google_calendar' });
      await this.put(priorPath, clear, prior.etag || 'null_etag');
      await this.put('/workschedule_v2/status/' + change.priorDate + '/' + change.employeeId, Object.assign(statusForChange({ action: 'clear', row: clear }, nowMs), { moved_to: change.date }));
    }
    return row;
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
  async enqueuePullSignal(row) { const key = auditKey(row.at_ms || Date.now()); await this.put(this.metaPath('pull_signals/' + key), row); return key; }
  async getChannel() { return await this.get(this.metaPath('channel')); }
  async setChannel(row) { return await this.put(this.metaPath('channel'), row); }
  async getOverlay(date) { return await this.get(this.overlayRoot + '/' + date); }
  async setOverlay(date, row) { return await this.put(this.overlayRoot + '/' + date, row); }
}
