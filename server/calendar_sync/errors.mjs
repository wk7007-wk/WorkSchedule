export class CalendarSyncError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'calendar_sync_error';
    this.status = options.status || 500;
    this.retryable = options.retryable === true;
    this.details = options.details || null;
  }
}

export class GoneSyncTokenError extends CalendarSyncError {
  constructor(message = 'Google Calendar sync token is no longer valid') {
    super(message, { code: 'sync_token_gone', status: 410, retryable: false });
  }
}

export class EtagConflictError extends CalendarSyncError {
  constructor(message = 'Calendar event ETag changed') {
    super(message, { code: 'etag_conflict', status: 412, retryable: false });
  }
}

export class DestinationCollisionError extends EtagConflictError {
  constructor(message = 'Move destination already has an unrelated explicit override') {
    super(message);
    this.code = 'move_destination_occupied';
  }
}

export class SourceRevisionConflictError extends EtagConflictError {
  constructor(message = 'Move source changed after Google import precheck') {
    super(message);
    this.code = 'move_source_changed';
  }
}

export class AtomicMoveUnavailableError extends EtagConflictError {
  constructor(message = 'Atomic cross-date move writer is not configured') {
    super(message);
    this.code = 'atomic_move_unavailable';
    this.status = 503;
  }
}

export class StaleFenceError extends CalendarSyncError {
  constructor(message = 'Worker lease fence is no longer current') {
    super(message, { code: 'stale_fence', status: 409, retryable: false });
  }
}

export class RetryableProviderError extends CalendarSyncError {
  constructor(message, options = {}) {
    super(message, {
      code: options.code || 'provider_retryable',
      status: options.status || 503,
      retryable: true,
      details: options.details || null
    });
    this.retryAfterMs = Number.isFinite(options.retryAfterMs) ? options.retryAfterMs : null;
  }
}

export class LiveAuthBlockedError extends CalendarSyncError {
  constructor(message = 'Live Google Calendar authentication is not configured') {
    super(message, { code: 'live_auth_blocked', status: 503, retryable: false });
  }
}

export class FeatureDisabledError extends CalendarSyncError {
  constructor(reason = 'feature_disabled') {
    super('Calendar synchronization is disabled: ' + reason, { code: reason, status: 503, retryable: false });
  }
}
