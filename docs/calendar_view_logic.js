(function (root, factory) {
  const core = root && root.WorkScheduleCalendarCoreLogic
    ? root.WorkScheduleCalendarCoreLogic
    : (typeof require === 'function' ? require('./calendar_core_logic.js') : null);
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkScheduleCalendarViewLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  if (!core) throw new Error('WorkScheduleCalendarCoreLogic is required');

  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function hasOwn(object, key) {
    return !!object && Object.prototype.hasOwnProperty.call(object, key);
  }

  function weatherValue(weather, key, suffix) {
    if (!weather || !hasOwn(weather, key) || weather[key] == null || weather[key] === '') return '-';
    return esc(weather[key]) + suffix;
  }

  function eventLanes(events) {
    const laneEnds = [];
    const assigned = (events || []).map(event => {
      let lane = laneEnds.findIndex(end => end <= event.startMin);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = event.endMin;
      return Object.assign({}, event, { lane });
    });
    const laneCount = Math.max(1, laneEnds.length);
    return assigned.map(event => Object.assign(event, { laneCount }));
  }

  function buildCalendarModel(input) {
    const view = ['day', 'week', 'month'].includes(input && input.view) ? input.view : 'week';
    const anchor = core.dateKey(input && input.anchor);
    const dateKeys = core.rangeForView(anchor, view);
    const employees = input && input.employees && typeof input.employees === 'object' ? input.employees : {};
    const stableEmployeeIds = (input && input.employeeIds || Object.keys(employees)).slice();
    const overlays = input && input.overlays && typeof input.overlays === 'object' ? input.overlays : {};
    const resolveShift = typeof input.resolveShift === 'function' ? input.resolveShift : function () { return null; };
    const resolveOff = typeof input.resolveOff === 'function' ? input.resolveOff : function () { return false; };
    const resolveStatus = typeof input.resolveStatus === 'function' ? input.resolveStatus : function () { return 'auto'; };
    const today = core.dateKey(input && input.today || new Date());

    const days = dateKeys.map(date => {
      const overlay = overlays[date] || core.mockOverlayForDate(date, input && input.nowMs);
      const employeeIds = core.sortEmployeeIdsForDate(stableEmployeeIds, employeeId => resolveShift(date, employeeId));
      const events = [];
      const off = [];
      employeeIds.forEach(employeeId => {
        if (resolveOff(date, employeeId)) {
          off.push({ employeeId, employeeName: String(employees[employeeId] && employees[employeeId].name || employeeId) });
          return;
        }
        const shift = resolveShift(date, employeeId);
        const event = core.eventFromSchedule({
          date,
          employeeId,
          employee: employees[employeeId],
          shift,
          status: resolveStatus(date, employeeId),
          source: shift && shift.source || 'resolved'
        });
        if (event) {
          event.light = core.classifyShiftLight(shift, overlay);
          events.push(event);
        }
      });
      const sortedEvents = core.sortEvents(events, stableEmployeeIds);
      const overlap = core.computeOverlap(sortedEvents);
      const dateObject = core.parseDateKey(date);
      return {
        date,
        dateObject,
        day: dateObject ? dateObject.getDate() : '',
        month: dateObject ? dateObject.getMonth() + 1 : '',
        dow: dateObject ? DOW[dateObject.getDay()] : '',
        weekend: !!dateObject && (dateObject.getDay() === 0 || dateObject.getDay() === 6),
        selected: date === anchor,
        today: date === today,
        outsideMonth: view === 'month' && !!dateObject && !!core.parseDateKey(anchor) && dateObject.getMonth() !== core.parseDateKey(anchor).getMonth(),
        employeeIds,
        events: eventLanes(sortedEvents),
        off,
        overlap,
        overlay,
        holiday: core.holidayName(date, overlay),
        gradient: core.buildDayGradient(overlay),
        freshness: core.overlayFreshness(overlay, input && input.nowMs)
      };
    });

    return {
      schemaVersion: 'workschedule.calendar_view.v1',
      view,
      anchor,
      dateKeys,
      days,
      stableEmployeeIds,
      timeZone: core.DEFAULT_TIME_ZONE,
      dayStartMin: core.DAY_START_MIN,
      dayEndMin: core.DAY_END_MIN
    };
  }

  function dayClass(day) {
    return 'calendar-day' +
      (day.selected ? ' is-selected' : '') +
      (day.today ? ' is-today' : '') +
      (day.outsideMonth ? ' is-outside' : '') +
      (day.holiday ? ' is-holiday' : '') +
      (day.weekend ? ' is-weekend' : '');
  }

  function overlayLine(day, compact) {
    const weather = day.overlay && day.overlay.weather || {};
    const stale = day.freshness.stale;
    const precipitation = weatherValue(weather, 'precipitation_mm', 'mm');
    const probability = weatherValue(weather, 'precipitation_probability_pct', '%');
    const humidity = weatherValue(weather, 'humidity_pct', '%');
    if (compact) return '<span class="calendar-weather' + (stale ? ' is-stale' : '') + '">비 ' + precipitation + ' · ' + probability + '</span>';
    return '<div class="calendar-overlay-line' + (stale ? ' is-stale' : '') + '">' +
      '<span>강수 ' + precipitation + '</span><span>확률 ' + probability + '</span><span>습도 ' + humidity + '</span>' +
      '<span>☀ ' + esc(day.overlay.sunrise || '-') + '</span><span>☾ ' + esc(day.overlay.sunset || '-') + '</span>' +
      '</div>';
  }

  function renderContextSummary(day) {
    if (!day) return '';
    const basis = day.overlay && (day.overlay.basis_at || day.overlay.basisAt) || '기준시각 없음';
    const source = day.freshness.providerMode === 'mock' ? 'mock/연결 대기' : day.freshness.source;
    return '<section class="calendar-context-summary" data-calendar-context-date="' + esc(day.date) + '">' +
      '<div><strong>' + esc(day.date) + ' 환경</strong>' + (day.holiday ? '<span class="calendar-holiday">' + esc(day.holiday) + '</span>' : '') + '</div>' +
      overlayLine(day, false) +
      '<div class="calendar-context-meta"><span>기준 ' + esc(basis) + '</span><span>' + (day.freshness.stale ? 'stale/예시' : 'fresh') + '</span><span>source ' + esc(source) + '</span></div>' +
      '</section>';
  }

  function renderMonth(model) {
    let html = '<div class="calendar-month" role="grid" aria-label="월간 근무표">';
    ['월', '화', '수', '목', '금', '토', '일'].forEach(label => {
      html += '<div class="calendar-month-dow" role="columnheader">' + label + '</div>';
    });
    model.days.forEach(day => {
      html += '<section class="' + dayClass(day) + '" role="gridcell" data-calendar-date="' + day.date + '">' +
        '<div class="calendar-month-head"><button type="button" data-calendar-select-day="' + day.date + '">' + day.day + '</button>' +
        (day.holiday ? '<span class="calendar-holiday">' + esc(day.holiday) + '</span>' : '') + '</div>' +
        overlayLine(day, true) +
        '<div class="calendar-month-events">';
      day.events.slice(0, 4).forEach(event => {
        html += '<button type="button" class="calendar-event-chip" data-calendar-event="' + esc(event.key) + '" data-calendar-date="' + day.date + '" data-calendar-employee="' + esc(event.employeeId) + '" style="--event-color:' + esc(event.color) + '">' +
          '<span>' + esc(event.start) + '</span><strong>' + esc(event.employeeName) + '</strong>' +
          '<small>' + esc(event.light.label) + '</small></button>';
      });
      if (day.events.length > 4) html += '<span class="calendar-more">+' + (day.events.length - 4) + '개</span>';
      html += '</div><div class="calendar-month-foot"><span>동시 ' + day.overlap.maxCount + '명</span><button type="button" data-calendar-create-day="' + day.date + '">＋</button></div></section>';
    });
    return html + '</div>';
  }

  function renderTimeGutter() {
    let html = '<div class="calendar-time-gutter" aria-hidden="true">';
    for (let minute = core.DAY_START_MIN; minute < core.DAY_END_MIN; minute += 60) {
      html += '<span style="top:' + ((minute - core.DAY_START_MIN) / (24 * 60) * 100) + '%">' + core.clockFromOperationalMinute(minute) + '</span>';
    }
    return html + '</div>';
  }

  function renderTimelineDay(day) {
    let html = '<section class="' + dayClass(day) + ' calendar-timeline-day" data-calendar-date="' + day.date + '">' +
      '<header class="calendar-timeline-head"><button type="button" data-calendar-select-day="' + day.date + '"><strong>' + day.dow + '</strong><span>' + day.month + '/' + day.day + '</span></button>' +
      (day.holiday ? '<span class="calendar-holiday">' + esc(day.holiday) + '</span>' : '') +
      overlayLine(day, true) + '<span class="calendar-overlap-max">동시 최대 ' + day.overlap.maxCount + '명</span>' +
      (day.off.length ? '<span class="calendar-off-list">휴 ' + day.off.map(item => esc(item.employeeName)).join(', ') + '</span>' : '') + '</header>';
    html += '<div class="calendar-day-track" style="background:' + esc(day.gradient) + '">';
    for (let minute = core.DAY_START_MIN; minute < core.DAY_END_MIN; minute += 30) {
      const top = (minute - core.DAY_START_MIN) / (24 * 60) * 100;
      html += '<button type="button" class="calendar-slot" data-calendar-slot-date="' + day.date + '" data-calendar-slot-minute="' + minute + '" style="top:' + top + '%" aria-label="' + day.date + ' ' + core.clockFromOperationalMinute(minute) + ' 근무 추가"></button>';
    }
    day.overlap.segments.filter(segment => segment.count > 1).forEach(segment => {
      const top = (segment.startMin - core.DAY_START_MIN) / (24 * 60) * 100;
      const height = (segment.endMin - segment.startMin) / (24 * 60) * 100;
      html += '<span class="calendar-overlap-band" style="top:' + top + '%;height:' + height + '%" title="동시 근무 ' + segment.count + '명"><b>' + segment.count + '</b></span>';
    });
    day.events.forEach(event => {
      const top = (event.startMin - core.DAY_START_MIN) / (24 * 60) * 100;
      const height = Math.max((event.endMin - event.startMin) / (24 * 60) * 100, 1.8);
      const width = 100 / event.laneCount;
      const left = event.lane * width;
      html += '<button type="button" class="calendar-event calendar-event-' + esc(event.light.kind) + '" data-calendar-event="' + esc(event.key) + '" data-calendar-date="' + day.date + '" data-calendar-employee="' + esc(event.employeeId) + '" style="top:' + top + '%;height:' + height + '%;left:calc(' + left + '% + 2px);width:calc(' + width + '% - 4px);--event-color:' + esc(event.color) + '">' +
        '<strong>' + esc(event.employeeName) + '</strong><span>' + esc(event.start) + '–' + esc(event.end) + '</span><small>' + esc(event.role || '역할 미지정') + ' · ' + esc(event.light.label) + '</small></button>';
    });
    return html + '</div></section>';
  }

  function renderTimeline(model) {
    let html = '<div class="calendar-timeline-scroll"><div class="calendar-timeline" data-calendar-columns="' + model.days.length + '" style="--calendar-columns:' + model.days.length + '">' + renderTimeGutter() + '<div class="calendar-timeline-days">';
    model.days.forEach(day => { html += renderTimelineDay(day); });
    return html + '</div></div></div>';
  }

  function renderCalendarMarkup(model) {
    if (!model || !Array.isArray(model.days)) return '<div class="calendar-empty">근무표를 불러오는 중입니다.</div>';
    const selected = model.days.find(day => day.selected) || model.days[0];
    return renderContextSummary(selected) + (model.view === 'month' ? renderMonth(model) : renderTimeline(model));
  }

  return {
    DOW,
    esc,
    eventLanes,
    buildCalendarModel,
    renderContextSummary,
    renderMonth,
    renderTimeline,
    renderCalendarMarkup
  };
});
