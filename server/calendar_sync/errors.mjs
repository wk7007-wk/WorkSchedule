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
