(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkScheduleCalendarCoreLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY_START_MIN = 6 * 60;
  const DAY_END_MIN = DAY_START_MIN + 24 * 60;
  const DEFAULT_TIME_ZONE = 'Asia/Seoul';
  const CALENDAR_NAMESPACE = Object.freeze({
    canonicalRoot: '/workschedule_v2',
    coreInputRoots: Object.freeze([
      '/workschedule_v2/employees',
      '/workschedule_v2/fixed_schedules',
      '/workschedule_v2/overrides',
      '/workschedule_v2/status'
    ]),
    attendanceRoot: '/workschedule_v2/attendance',
    syncMetadataRoot: '/workschedule_v2/meta/calendar_core/google',
    outboxRoot: '/workschedule_v2/meta/calendar_core/google/outbox',
    overlayRoot: '/workschedule_v2/meta/calendar_overlay'
  });
  const DEFAULT_KR_HOLIDAYS = Object.freeze({
    '2026-01-01': '신정',
    '2026-01-28': '설날연휴',
    '2026-01-29': '설날',
    '2026-01-30': '설날연휴',
    '2026-03-01': '삼일절',
    '2026-05-05': '어린이날',
    '2026-05-06': '대체공휴일',
    '2026-05-24': '석가탄신일',
    '2026-06-06': '현충일',
    '2026-08-15': '광복절',
    '2026-09-24': '추석연휴',
    '2026-09-25': '추석',
    '2026-09-26': '추석연휴',
    '2026-10-03': '개천절',
    '2026-10-09': '한글날',
    '2026-12-25': '성탄절',
    '2027-01-01': '신정',
    '2027-02-07': '설날연휴',
    '2027-02-08': '설날',
    '2027-02-09': '설날연휴',
    '2027-03-01': '삼일절',
    '2027-05-05': '어린이날',
    '2027-05-13': '석가탄신일',
    '2027-06-06': '현충일',
    '2027-08-15': '광복절',
    '2027-08-16': '대체공휴일',
    '2027-10-03': '개천절',
    '2027-10-04': '추석연휴',
    '2027-10-05': '추석',
    '2027-10-06': '추석연휴',
    '2027-10-09': '한글날',
    '2027-12-25': '성탄절'
  });

  const EXPIRY_FIELDS = new Set([
    'expires', 'expires_at', 'expires_at_ms', 'expiresAt', 'expiresAtMs',
    'expiry', 'expiry_at', 'expiry_at_ms', 'expiryAt', 'expiryAtMs',
    'valid_until', 'valid_until_ms', 'validUntil', 'validUntilMs', 'until'
  ]);

  function pad(value) {
    const number = Number(value);
    return number < 10 ? '0' + number : String(number);
  }

  function parseDateKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function dateKey(value) {
    const date = value instanceof Date ? value : parseDateKey(value);
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function addDays(value, amount) {
    const date = value instanceof Date ? new Date(value) : parseDateKey(value);
    if (!date) return null;
    date.setDate(date.getDate() + Number(amount || 0));
    return date;
  }

  function startOfWeek(value) {
    const date = value instanceof Date ? new Date(value) : parseDateKey(value);
    if (!date) return null;
    const day = date.getDay();
    date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function rangeForView(anchorValue, view) {
    const anchor = anchorValue instanceof Date ? new Date(anchorValue) : parseDateKey(anchorValue);
    if (!anchor) return [];
    if (view === 'day') return [dateKey(anchor)];
    if (view === 'month') {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const start = startOfWeek(first);
      return Array.from({ length: 42 }, (_, index) => dateKey(addDays(start, index)));
    }
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => dateKey(addDays(start, index)));
  }

  function parseClock(value) {
    const match = String(value || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function operationalMinute(value, dayStartMin) {
    const minute = parseClock(value);
    if (minute == null) return null;
    const boundary = Number.isFinite(dayStartMin) ? dayStartMin : DAY_START_MIN;
    return minute < boundary ? minute + 24 * 60 : minute;
  }

  function clockFromOperationalMinute(value) {
    const minute = ((Math.round(Number(value)) % (24 * 60)) + 24 * 60) % (24 * 60);
    return pad(Math.floor(minute / 60)) + ':' + pad(minute % 60);
  }

  function shiftSpan(shift, dayStartMin) {
    if (!shift || typeof shift !== 'object') return null;
    const startMin = operationalMinute(shift.start, dayStartMin);
    let endMin = operationalMinute(shift.end, dayStartMin);
    if (startMin == null || endMin == null) return null;
    if (endMin <= startMin) endMin += 24 * 60;
    return { startMin, endMin, durationMin: endMin - startMin };
  }

  function eventFromSchedule(input) {
    const date = dateKey(input && input.date);
    const employeeId = String(input && input.employeeId || '');
    const span = shiftSpan(input && input.shift);
    if (!date || !employeeId || !span) return null;
    const employee = input.employee && typeof input.employee === 'object' ? input.employee : {};
    return {
      key: date + '|' + employeeId,
      date,
      employeeId,
      employeeName: String(employee.name || employeeId),
      color: String(employee.color || '#4ECDC4'),
      role: String(input.shift.role || ''),
      start: input.shift.start,
      end: input.shift.end,
      startMin: span.startMin,
      endMin: span.endMin,
      durationMin: span.durationMin,
      status: String(input.status || 'auto'),
      source: String(input.source || 'resolved')
    };
  }

  function sortEvents(events, stableEmployeeOrder) {
    const order = new Map((stableEmployeeOrder || []).map((id, index) => [String(id), index]));
    return (events || []).slice().sort((left, right) => {
      if (left.startMin !== right.startMin) return left.startMin - right.startMin;
      const leftOrder = order.has(String(left.employeeId)) ? order.get(String(left.employeeId)) : Number.MAX_SAFE_INTEGER;
      const rightOrder = order.has(String(right.employeeId)) ? order.get(String(right.employeeId)) : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left.key || '').localeCompare(String(right.key || ''));
    });
  }

  function sortEmployeeIdsForDate(employeeIds, resolveShift) {
    const stable = (employeeIds || []).slice();
    const originalOrder = new Map(stable.map((id, index) => [String(id), index]));
    return stable.sort((left, right) => {
      const leftSpan = shiftSpan(resolveShift ? resolveShift(left) : null);
      const rightSpan = shiftSpan(resolveShift ? resolveShift(right) : null);
      const leftStart = leftSpan ? leftSpan.startMin : Number.POSITIVE_INFINITY;
      const rightStart = rightSpan ? rightSpan.startMin : Number.POSITIVE_INFINITY;
      if (leftStart !== rightStart) return leftStart - rightStart;
      return originalOrder.get(String(left)) - originalOrder.get(String(right));
    });
  }

  function computeOverlap(events) {
    const points = [];
    (events || []).forEach(event => {
      if (!event || !Number.isFinite(event.startMin) || !Number.isFinite(event.endMin) || event.endMin <= event.startMin) return;
      points.push({ minute: event.startMin, type: 'start', key: String(event.key || event.employeeId || points.length) });
      points.push({ minute: event.endMin, type: 'end', key: String(event.key || event.employeeId || points.length) });
    });
    points.sort((left, right) => left.minute - right.minute || (left.type === 'end' ? -1 : 1));
    const active = new Set();
    const segments = [];
    let index = 0;
    let previous = points.length ? points[0].minute : null;
    let maxCount = 0;
    while (index < points.length) {
      const minute = points[index].minute;
      if (previous != null && minute > previous && active.size > 0) {
        segments.push({ startMin: previous, endMin: minute, count: active.size, eventKeys: Array.from(active).sort() });
        maxCount = Math.max(maxCount, active.size);
      }
      const atMinute = [];
      while (index < points.length && points[index].minute === minute) atMinute.push(points[index++]);
      atMinute.filter(point => point.type === 'end').forEach(point => active.delete(point.key));
      atMinute.filter(point => point.type === 'start').forEach(point => active.add(point.key));
      maxCount = Math.max(maxCount, active.size);
      previous = minute;
    }
    return { maxCount, segments };
  }

  function daylightRanges(context) {
    const sunrise = parseClock(context && context.sunrise || '06:00');
    const sunset = parseClock(context && context.sunset || '18:00');
    if (sunrise == null || sunset == null || sunset <= sunrise) return [];
    return [
      { startMin: sunrise, endMin: sunset },
      { startMin: sunrise + 24 * 60, endMin: sunset + 24 * 60 }
    ];
  }

  function classifyShiftLight(shift, context) {
    const span = shiftSpan(shift);
    if (!span) return { kind: 'unknown', label: '밝기 미상', daylightMin: 0, darkMin: 0 };
    let daylightMin = 0;
    daylightRanges(context).forEach(range => {
      daylightMin += Math.max(0, Math.min(span.endMin, range.endMin) - Math.max(span.startMin, range.startMin));
    });
    const darkMin = Math.max(0, span.durationMin - daylightMin);
    if (daylightMin === 0) return { kind: 'dark', label: '어두운 근무', daylightMin, darkMin };
    if (darkMin === 0) return { kind: 'light', label: '밝은 근무', daylightMin, darkMin };
    return { kind: 'mixed', label: daylightMin >= darkMin ? '주간 중심' : '야간 중심', daylightMin, darkMin };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pct(minute, startMin, endMin) {
    return clamp((minute - startMin) / (endMin - startMin) * 100, 0, 100);
  }

  function buildDayGradient(context, startMin, endMin) {
    const start = Number.isFinite(startMin) ? startMin : DAY_START_MIN;
    const end = Number.isFinite(endMin) ? endMin : DAY_END_MIN;
    const sunrise = operationalMinute(context && context.sunrise || '06:00', start);
    let sunset = operationalMinute(context && context.sunset || '18:00', start);
    if (sunrise == null || sunset == null) return 'linear-gradient(to bottom, rgba(18,24,45,.92), rgba(18,24,45,.92))';
    if (sunset <= sunrise) sunset += 24 * 60;
    const dawnStart = pct(sunrise - 30, start, end);
    const dawnEnd = pct(sunrise + 30, start, end);
    const duskStart = pct(sunset - 30, start, end);
    const duskEnd = pct(sunset + 30, start, end);
    return 'linear-gradient(to bottom,' +
      'rgba(18,24,45,.94) 0%,' +
      'rgba(18,24,45,.94) ' + dawnStart + '%,' +
      'rgba(92,109,146,.35) ' + dawnEnd + '%,' +
      'rgba(98,145,184,.17) ' + duskStart + '%,' +
      'rgba(91,73,109,.36) ' + duskEnd + '%,' +
      'rgba(18,24,45,.94) 100%)';
  }

  function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(key => { out[key] = deepClone(value[key]); });
      return out;
    }
    return value;
  }

  function buildPermanentFixedSchedule(existing, patch, options) {
    const nowMs = Number(options && options.nowMs != null ? options.nowMs : Date.now());
    const out = Object.assign({}, deepClone(existing && typeof existing === 'object' ? existing : {}), deepClone(patch && typeof patch === 'object' ? patch : {}));
    EXPIRY_FIELDS.forEach(field => { delete out[field]; });
    out.kind = 'fixed';
    out.type = 'fixed';
    out.permanent = true;
    out.source = String(options && options.source || 'workschedule_web');
    out.updated_at_ms = nowMs;
    out.updated_at = new Date(nowMs).toISOString();
    return out;
  }

  function safeKey(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/[.#$\[\]\/\s|:]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 220) || 'item';
  }

  function buildOutboxItem(input) {
    const nowMs = Number(input && input.nowMs != null ? input.nowMs : Date.now());
    const entity = input && input.entity === 'fixed_schedule' ? 'fixed_schedule' : 'daily_override';
    const date = entity === 'daily_override' ? dateKey(input && input.date) : '';
    const employeeId = String(input && input.employeeId || '');
    const row = deepClone(input && input.row && typeof input.row === 'object' ? input.row : {});
    const revision = String(row.updated_at_ms != null ? row.updated_at_ms : nowMs);
    const canonicalKey = entity === 'fixed_schedule' ? 'fixed|' + employeeId : 'daily|' + date + '|' + employeeId;
    const action = entity === 'fixed_schedule' ? 'reconcile_fixed_horizon' : String(row.state || 'shift');
    const idempotencyKey = safeKey(canonicalKey + '|' + action + '|' + revision);
    return {
      id: idempotencyKey,
      idempotency_key: idempotencyKey,
      schema_version: 'workschedule.calendar_core.outbox.v1',
      source: 'workschedule_web',
      canonical_root: '/workschedule_v2',
      metadata_root: '/workschedule_v2/meta/calendar_core/google',
      canonical_key: canonicalKey,
      entity,
      date: date || null,
      employee_id: employeeId,
      action,
      canonical_revision: revision,
      canonical_path: entity === 'fixed_schedule'
        ? '/workschedule_v2/fixed_schedules/' + employeeId
        : '/workschedule_v2/overrides/' + date + '/' + employeeId,
      created_at_ms: nowMs,
      status: 'pending',
      attempt_count: 0,
      next_attempt_at_ms: nowMs
    };
  }

  async function saveCoreThenQueue(writeCore, queueOutbox, item, onOutboxError) {
    const coreResult = await writeCore();
    if (!coreResult) return { coreSaved: false, outboxScheduled: false, coreResult, outboxPromise: null };
    const outboxPromise = Promise.resolve()
      .then(function () { return queueOutbox(item); })
      .then(function (result) { return { ok: result !== false, result }; })
      .catch(function (error) {
        if (typeof onOutboxError === 'function') onOutboxError(error);
        return { ok: false, error: String(error && (error.code || error.message) || 'outbox_error') };
      });
    return { coreSaved: true, outboxScheduled: true, coreResult, outboxPromise };
  }

  function hasOwn(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function mergeCoreOverlay(core, overlay) {
    const result = { core: deepClone(core || {}), overlay: {} };
    const source = overlay && typeof overlay === 'object' ? overlay : {};
    Object.keys(source).forEach(key => { result.overlay[key] = deepClone(source[key]); });
    return result;
  }

  function overlayFreshness(overlay, nowMs) {
    const now = Number(nowMs == null ? Date.now() : nowMs);
    const fetched = hasOwn(overlay, 'fetched_at_ms') ? Number(overlay.fetched_at_ms) : null;
    const expires = hasOwn(overlay, 'expires_at_ms') ? Number(overlay.expires_at_ms) : null;
    const stale = !Number.isFinite(expires) || expires <= now;
    return {
      stale,
      fetchedAtMs: Number.isFinite(fetched) ? fetched : null,
      expiresAtMs: Number.isFinite(expires) ? expires : null,
      source: String(overlay && overlay.source || 'mock_fallback'),
      providerMode: String(overlay && overlay.provider_mode || 'mock')
    };
  }

  function holidayName(date, overlay) {
    const key = dateKey(date);
    if (overlay && hasOwn(overlay, 'holiday')) {
      if (overlay.holiday == null || overlay.holiday === false || overlay.holiday === '') return '';
      if (typeof overlay.holiday === 'object') return String(overlay.holiday.name || overlay.holiday.label || '공휴일');
      return String(overlay.holiday);
    }
    return DEFAULT_KR_HOLIDAYS[key] || '';
  }

  function hashDate(value) {
    return String(value || '').split('').reduce((total, char) => (total * 33 + char.charCodeAt(0)) >>> 0, 5381);
  }

  function mockOverlayForDate(dateValue, nowMs) {
    const key = dateKey(dateValue);
    const hash = hashDate(key);
    const fetchedAtMs = Number(nowMs == null ? Date.now() : nowMs);
    const holiday = DEFAULT_KR_HOLIDAYS[key] || '';
    const precipitationOptions = [0, 0, 0, 0.5, 1.5];
    const precipitation = precipitationOptions[hash % precipitationOptions.length];
    return {
      schema_version: 'workschedule.calendar_overlay.v1',
      date: key,
      source: 'mock_fallback',
      provider_mode: 'mock',
      live: false,
      fetched_at_ms: fetchedAtMs,
      expires_at_ms: fetchedAtMs,
      basis_at: key + 'T06:00:00+09:00',
      weather: {
        precipitation_mm: precipitation,
        precipitation_probability_pct: precipitation === 0 ? 0 : 40 + (hash % 5) * 10,
        humidity_pct: 50 + hash % 31
      },
      sunrise: '06:10',
      sunset: '18:50',
      holiday: holiday ? { name: holiday, country: 'KR' } : null,
      limitations: ['live_provider_credentials_missing']
    };
  }

  return {
    DAY_START_MIN,
    DAY_END_MIN,
    DEFAULT_TIME_ZONE,
    CALENDAR_NAMESPACE,
    DEFAULT_KR_HOLIDAYS,
    EXPIRY_FIELDS,
    pad,
    parseDateKey,
    dateKey,
    addDays,
    startOfWeek,
    rangeForView,
    parseClock,
    operationalMinute,
    clockFromOperationalMinute,
    shiftSpan,
    eventFromSchedule,
    sortEvents,
    sortEmployeeIdsForDate,
    computeOverlap,
    classifyShiftLight,
    buildDayGradient,
    deepClone,
    buildPermanentFixedSchedule,
    safeKey,
    buildOutboxItem,
    saveCoreThenQueue,
    mergeCoreOverlay,
    overlayFreshness,
    holidayName,
    mockOverlayForDate
  };
});
