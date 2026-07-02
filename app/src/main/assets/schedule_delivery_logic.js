(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WorkScheduleDeliveryLogic = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var IDLE_MS = 5 * 60 * 1000;
  var PERIODIC_MS = 6 * 60 * 60 * 1000;

  function toMs(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function pickNow(value) {
    var n = toMs(value);
    return n === null ? Date.now() : n;
  }

  function computeDeliveryState(input) {
    input = input || {};
    var nowMs = pickNow(input.nowMs);
    var idleMs = toMs(input.idleMs);
    var periodicMs = toMs(input.periodicMs);
    idleMs = idleMs === null ? IDLE_MS : idleMs;
    periodicMs = periodicMs === null ? PERIODIC_MS : periodicMs;

    var lastChangedAtMs = toMs(input.lastChangedAtMs);
    var lastPreparedAtMs = toMs(input.lastPreparedAtMs);
    var lastSentAtMs = toMs(input.lastSentAtMs);
    var idleDueAtMs = lastChangedAtMs === null ? null : lastChangedAtMs + idleMs;
    var idleAlreadyPrepared = lastChangedAtMs !== null && lastPreparedAtMs !== null && lastPreparedAtMs >= lastChangedAtMs;
    var idleDue = lastChangedAtMs !== null && !idleAlreadyPrepared && nowMs >= idleDueAtMs;

    var periodicDueAtMs = lastSentAtMs === null ? null : lastSentAtMs + periodicMs;
    if (periodicDueAtMs !== null && idleDueAtMs !== null) {
      periodicDueAtMs = Math.max(periodicDueAtMs, idleDueAtMs);
    }
    var periodicDue = !idleDue && periodicDueAtMs !== null && nowMs >= periodicDueAtMs;
    var dueReason = idleDue ? 'idle' : (periodicDue ? 'periodic' : null);

    var next = [];
    if (!idleAlreadyPrepared && idleDueAtMs !== null && idleDueAtMs > nowMs) next.push(idleDueAtMs);
    if (periodicDueAtMs !== null && periodicDueAtMs > nowMs) next.push(periodicDueAtMs);

    return {
      targetKind: input.targetKind || 'latest_work_schedule',
      nowMs: nowMs,
      idleMs: idleMs,
      periodicMs: periodicMs,
      lastChangedAtMs: lastChangedAtMs,
      lastPreparedAtMs: lastPreparedAtMs,
      lastSentAtMs: lastSentAtMs,
      idleDueAtMs: idleDueAtMs,
      periodicDueAtMs: periodicDueAtMs,
      idleDue: idleDue,
      periodicDue: periodicDue,
      due: !!dueReason,
      dueReason: dueReason,
      nextDueAtMs: dueReason || !next.length ? null : Math.min.apply(Math, next)
    };
  }

  function markScheduleChanged(state, nowMs) {
    var n = pickNow(nowMs);
    state = state || {};
    return Object.assign({}, state, {
      targetKind: state.targetKind || 'latest_work_schedule',
      lastChangedAtMs: n,
      lastPreparedAtMs: null,
      updatedAtMs: n
    });
  }

  function markShareIntentQueued(state, nowMs) {
    var n = pickNow(nowMs);
    state = state || {};
    return Object.assign({}, state, {
      targetKind: state.targetKind || 'latest_work_schedule',
      lastPreparedAtMs: n,
      lastSentAtMs: n,
      updatedAtMs: n
    });
  }

  return {
    IDLE_MS: IDLE_MS,
    PERIODIC_MS: PERIODIC_MS,
    computeDeliveryState: computeDeliveryState,
    markScheduleChanged: markScheduleChanged,
    markShareIntentQueued: markShareIntentQueued
  };
});
