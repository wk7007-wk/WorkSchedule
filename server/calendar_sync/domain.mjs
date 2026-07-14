import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../docs/calendar_core_logic.js');

const DOW_EN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function revisionOf(row, fallback = '') {
  if (row && Object.prototype.hasOwnProperty.call(row, 'updated_at_ms')) return String(row.updated_at_ms);
  if (row && Object.prototype.hasOwnProperty.call(row, 'revision')) return String(row.revision);
  const digest = crypto.createHash('sha256').update(canonicalJson(row || {})).digest('hex').slice(0, 24);
  return digest || String(fallback || '0');
}

export function mappingIdForCanonicalKey(canonicalKey) {
  return crypto.createHash('sha256').update(String(canonicalKey)).digest('hex').slice(0, 32);
}

// Google accepts caller supplied IDs containing only base32hex characters
// (0-9, a-v). A SHA-256 hex digest is a valid subset and is stable across
// retries, which lets an ambiguous insert be recovered with events.get.
export function deterministicGoogleEventId(canonicalKey) {
  return 'c' + crypto.createHash('sha256').update(String(canonicalKey)).digest('hex');
}

export function canonicalKey(date, employeeId) {
  return 'daily|' + core.dateKey(date) + '|' + String(employeeId || '');
}

export function parseCanonicalKey(value) {
  const match = String(value || '').match(/^daily\|(\d{4}-\d{2}-\d{2})\|(.+)$/);
  return match ? { date: match[1], employeeId: match[2] } : null;
}

function rowState(row) {
  return String(row && (row.state || row.status || row.type) || '').toLowerCase();
}

function explicitShift(row) {
  if (!row || typeof row !== 'object') return null;
  const state = rowState(row);
  if (state && state !== 'shift' && state !== 'manual_shift') return null;
  const shift = row.shift && typeof row.shift === 'object' ? row.shift : row;
  return shift.start || shift.end ? { start: shift.start || '', end: shift.end || '', role: shift.role || row.role || '' } : null;
}

function fixedShiftForDate(fixed, date) {
  if (!fixed || typeof fixed !== 'object') return null;
  const dateObject = core.parseDateKey(date);
  if (!dateObject) return null;
  const day = dateObject.getDay();
  const dayKey = DOW_EN[day];
  const dayTimes = fixed.dayTimes && typeof fixed.dayTimes === 'object' ? fixed.dayTimes[dayKey] : null;
  const start = dayTimes && dayTimes.start ? dayTimes.start : fixed.start;
  const end = dayTimes && dayTimes.end ? dayTimes.end : fixed.end;
  const role = dayTimes && Object.prototype.hasOwnProperty.call(dayTimes, 'role') ? dayTimes.role : (fixed.role || '');
  if (!start && !end) return null;
  const kind = String(fixed.kind || fixed.type || 'fixed');
  if (kind === 'fixed') {
    if (Array.isArray(fixed.off) && fixed.off.includes(day)) return null;
    return { start, end, role };
  }
  if (kind === 'weekly') {
    if ((Array.isArray(fixed.days) && fixed.days.includes(dayKey)) || dayTimes) return { start, end, role };
  }
  return null;
}

export function resolveCanonicalDay(snapshot, date, employeeId) {
  const overrides = snapshot && snapshot.overrides && snapshot.overrides[date] || {};
  const override = overrides && overrides[employeeId];
  const state = rowState(override);
  if (state === 'off' || override && (override.off === true || override.dayoff === true)) {
    return { state: 'off', row: override, shift: null, source: 'override' };
  }
  const shift = explicitShift(override);
  if (shift) return { state: 'shift', row: override, shift, source: 'override' };
  if (state === 'clear' || override && (override.clear === true || override.cancel === true || override.deleted === true)) {
    return { state: 'clear', row: override, shift: null, source: 'override' };
  }
  const fixed = snapshot && snapshot.fixed_schedules && snapshot.fixed_schedules[employeeId];
  const fixedShift = fixedShiftForDate(fixed, date);
  return fixedShift
    ? { state: 'shift', row: fixed, shift: fixedShift, source: 'fixed_schedule' }
    : { state: 'missing', row: null, shift: null, source: 'missing' };
}

export function listResolvedCanonicalEvents(snapshot, startDate, endDate) {
  const employees = snapshot && snapshot.employees || {};
  const start = core.parseDateKey(startDate);
  const end = core.parseDateKey(endDate);
  if (!start || !end || end < start) return [];
  const result = [];
  for (let dateObject = new Date(start); dateObject <= end; dateObject.setDate(dateObject.getDate() + 1)) {
    const date = core.dateKey(dateObject);
    Object.keys(employees).forEach(employeeId => {
      const employee = employees[employeeId];
      if (!employee || employee.disabled || employee.active === false) return;
      const resolved = resolveCanonicalDay(snapshot, date, employeeId);
      if (resolved.state !== 'shift' && resolved.state !== 'off') return;
      result.push({
        canonicalKey: canonicalKey(date, employeeId),
        mappingId: mappingIdForCanonicalKey(canonicalKey(date, employeeId)),
        date,
        employeeId,
        employee,
        state: resolved.state,
        shift: resolved.shift,
        source: resolved.source,
        revision: revisionOf(resolved.row, date + '|' + employeeId),
        row: resolved.row
      });
    });
  }
  return result;
}

function plusDays(date, amount) {
  return core.dateKey(core.addDays(date, amount));
}

function zonedDateTime(date, time, offset = '+09:00') {
  return date + 'T' + time + ':00' + offset;
}

export function projectCanonicalToGoogleEvent(entity, options = {}) {
  const privateProps = {
    wsSchema: 'workschedule_v2.calendar_core.v1',
    wsCanonicalKey: entity.canonicalKey,
    wsMappingId: entity.mappingId || mappingIdForCanonicalKey(entity.canonicalKey),
    wsDate: entity.date,
    wsEmployeeId: entity.employeeId,
    wsRevision: String(entity.revision),
    wsState: entity.state,
    wsRole: String(entity.shift && entity.shift.role || '')
  };
  const employeeName = String(entity.employee && entity.employee.name || entity.employeeId);
  if (entity.state === 'off') {
    return {
      summary: '휴무 · ' + employeeName,
      description: 'WorkSchedule /workschedule_v2에서 동기화된 날짜별 휴무입니다.',
      start: { date: entity.date },
      end: { date: plusDays(entity.date, 1) },
      extendedProperties: { private: privateProps }
    };
  }
  const operationalDayStartMin = Number.isFinite(options.operationalDayStartMin)
    ? options.operationalDayStartMin
    : core.DAY_START_MIN;
  const span = core.shiftSpan(entity.shift, operationalDayStartMin);
  if (!span) throw new Error('Cannot project a shift without valid start/end');
  const startDate = span.startMin >= 24 * 60 ? plusDays(entity.date, 1) : entity.date;
  const endDate = span.endMin >= 24 * 60 ? plusDays(entity.date, 1) : entity.date;
  const role = String(entity.shift.role || '역할 미지정');
  return {
    summary: employeeName + ' · ' + role,
    description: 'WorkSchedule /workschedule_v2 일정 projection입니다. Google에서 바꾼 날짜/시간은 날짜별 override로 돌아옵니다.',
    location: String(options.locationName || ''),
    start: { dateTime: zonedDateTime(startDate, entity.shift.start), timeZone: options.timeZone || 'Asia/Seoul' },
    end: { dateTime: zonedDateTime(endDate, entity.shift.end), timeZone: options.timeZone || 'Asia/Seoul' },
    extendedProperties: { private: privateProps }
  };
}

function datePartsInTimeZone(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((out, part) => {
    if (part.type !== 'literal') out[part.type] = part.value;
    return out;
  }, {});
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}

function employeeFromEvent(event, employees, mapping) {
  const privateProps = event && event.extendedProperties && event.extendedProperties.private || {};
  const explicit = String(privateProps.wsEmployeeId || mapping && mapping.employeeId || '');
  if (explicit && employees[explicit] && !employees[explicit].disabled && employees[explicit].active !== false) return explicit;
  const summary = String(event && event.summary || '').toLowerCase();
  return Object.keys(employees).find(employeeId => {
    const employee = employees[employeeId];
    return employee && !employee.disabled && employee.active !== false && summary.includes(String(employee.name || employeeId).toLowerCase());
  }) || '';
}

export function googleEventToCanonical(event, context = {}) {
  const employees = context.employees || {};
  const mapping = context.mapping || null;
  const privateProps = event && event.extendedProperties && event.extendedProperties.private || {};
  const employeeId = employeeFromEvent(event, employees, mapping);
  if (!employeeId) return { ignored: true, reason: 'unmapped_google_event' };
  const priorKey = String(privateProps.wsCanonicalKey || mapping && mapping.canonicalKey || '');
  const prior = parseCanonicalKey(priorKey);
  const timeZone = context.timeZone || 'Asia/Seoul';
  const cancelled = event && (event.status === 'cancelled' || event.deleted === true);
  if (cancelled) {
    if (!prior) return { ignored: true, reason: 'unmapped_google_tombstone' };
    return {
      ignored: false,
      action: 'clear',
      date: prior.date,
      employeeId,
      priorDate: prior.date,
      canonicalKey: canonicalKey(prior.date, employeeId),
      row: {
        state: 'clear', type: 'clear', shift: null, start: '', end: '', role: '', work: false, active: false,
        off: false, dayoff: false, clear: true, source: 'google_calendar', google_event_id: event.id || '', google_etag: event.etag || ''
      }
    };
  }
  if (event && event.start && event.start.date) {
    const date = core.dateKey(event.start.date);
    return {
      ignored: false,
      action: String(privateProps.wsState || '').toLowerCase() === 'off' || /^휴무\s*[·:-]/.test(String(event.summary || '')) ? 'off' : 'unsupported_all_day',
      date,
      employeeId,
      priorDate: prior && prior.date || date,
      canonicalKey: canonicalKey(date, employeeId),
      row: {
        state: 'off', type: 'off', shift: null, start: '', end: '', role: '', work: false, active: false,
        off: true, dayoff: true, clear: false, source: 'google_calendar', google_event_id: event.id || '', google_etag: event.etag || ''
      }
    };
  }
  const start = datePartsInTimeZone(event && event.start && event.start.dateTime, timeZone);
  const end = datePartsInTimeZone(event && event.end && event.end.dateTime, timeZone);
  if (!start || !end) return { ignored: true, reason: 'invalid_google_event_time' };
  const operationalDayStartMin = Number.isFinite(context.operationalDayStartMin)
    ? context.operationalDayStartMin
    : core.DAY_START_MIN;
  const startMinute = core.parseClock(start.time);
  const operationalDate = startMinute != null && startMinute < operationalDayStartMin
    ? plusDays(start.date, -1)
    : start.date;
  const role = Object.prototype.hasOwnProperty.call(privateProps, 'wsRole') ? String(privateProps.wsRole) : '';
  const row = {
    state: 'shift', type: 'manual_shift',
    shift: { start: start.time, end: end.time, role },
    start: start.time, end: end.time, role,
    work: true, active: true, off: false, dayoff: false, clear: false,
    source: 'google_calendar', google_event_id: event.id || '', google_etag: event.etag || ''
  };
  return {
    ignored: false,
    action: prior && prior.date !== operationalDate ? 'move' : 'upsert_shift',
    date: operationalDate,
    employeeId,
    priorDate: prior && prior.date || operationalDate,
    canonicalKey: canonicalKey(operationalDate, employeeId),
    row
  };
}

export function addWriteMetadata(row, options = {}) {
  const nowMs = Number(options.nowMs == null ? Date.now() : options.nowMs);
  return Object.assign({}, row, {
    updated_at_ms: nowMs,
    updated_at: new Date(nowMs).toISOString(),
    source: String(options.source || row && row.source || 'calendar_sync_server')
  });
}

export { core as calendarCoreLogic };
