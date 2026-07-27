const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function csv(value, fallback) {
  const entries = String(value == null ? fallback : value).split(',').map(item => item.trim()).filter(Boolean);
  return entries.length ? entries : String(fallback).split(',').map(item => item.trim()).filter(Boolean);
}

export function loadCalendarSyncConfig(env = process.env) {
  const provider = String(env.WORKSCHEDULE_CALENDAR_PROVIDER || 'mock').trim().toLowerCase();
  const clientId = String(env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.GOOGLE_OAUTH_REDIRECT_URI || '').trim();
  const calendarId = String(env.GOOGLE_CALENDAR_ID || '').trim();
  const tokenEncryptionKey = String(env.WORKSCHEDULE_TOKEN_ENCRYPTION_KEY || '').trim();
  const googleCredentialsReady = !!(clientId && clientSecret && redirectUri && calendarId && tokenEncryptionKey);
  const featureEnabled = bool(env.WORKSCHEDULE_CALENDAR_SYNC_ENABLED, false);
  const killSwitch = bool(env.WORKSCHEDULE_CALENDAR_KILL_SWITCH, true);
  const webhookUrl = String(env.GOOGLE_CALENDAR_WEBHOOK_URL || '').trim();
  const maxAttempts = number(env.WORKSCHEDULE_CALENDAR_MAX_ATTEMPTS, 4, 1, 10);
  const retryBackoffMs = [1000, 5000, 30000, 120000];
  const maxRetryAfterMs = number(env.WORKSCHEDULE_CALENDAR_MAX_RETRY_AFTER_MS, 120000, 1000, 300000);
  const providerAttemptTimeoutMs = number(env.WORKSCHEDULE_CALENDAR_PROVIDER_TIMEOUT_MS, 15000, 1000, 120000);
  let outboxOperationWindowMs = maxAttempts * providerAttemptTimeoutMs;
  for (let attempt = 0; attempt < maxAttempts - 1; attempt += 1) {
    outboxOperationWindowMs += Math.max(
      retryBackoffMs[Math.min(attempt, retryBackoffMs.length - 1)],
      maxRetryAfterMs
    );
  }
  const requestedOutboxLeaseMs = number(
    env.WORKSCHEDULE_CALENDAR_OUTBOX_LEASE_MS,
    10 * 60 * 1000,
    5 * 1000,
    30 * 60 * 1000
  );
  const outboxLeaseMs = Math.max(requestedOutboxLeaseMs, outboxOperationWindowMs + 5000);

  return {
    schemaVersion: 'workschedule.calendar_sync.config.v1',
    provider,
    featureEnabled,
    killSwitch,
    pushEnabled: bool(env.WORKSCHEDULE_CALENDAR_PUSH_ENABLED, false),
    periodicPullEnabled: bool(env.WORKSCHEDULE_CALENDAR_PERIODIC_PULL_ENABLED, true),
    pastDateWritesAllowed: bool(env.WORKSCHEDULE_CALENDAR_PAST_DATE_WRITES_ALLOWED, false),
    liveAuthBlocked: provider === 'google' && !googleCredentialsReady,
    googleCredentialsReady,
    clientId,
    clientSecret,
    redirectUri,
    calendarId,
    oauthScopes: csv(env.GOOGLE_OAUTH_SCOPES, 'https://www.googleapis.com/auth/calendar.events'),
    tokenEncryptionKey,
    tokenFile: String(env.WORKSCHEDULE_TOKEN_FILE || '/var/lib/workschedule/google-calendar-token.enc'),
    firebaseDatabaseUrl: String(env.FIREBASE_DATABASE_URL || '').replace(/\/$/, ''),
    firebaseAuthToken: String(env.FIREBASE_AUTH_TOKEN || ''),
    metadataRoot: '/workschedule_v2/meta/calendar_core/google',
    overlayRoot: '/workschedule_v2/meta/calendar_overlay',
    canonicalRoot: '/workschedule_v2',
    locationName: String(env.WORKSCHEDULE_LOCATION_NAME || '이천시 부발읍'),
    latitude: number(env.WORKSCHEDULE_LOCATION_LAT, 37.2816, -90, 90),
    longitude: number(env.WORKSCHEDULE_LOCATION_LNG, 127.4892, -180, 180),
    timeZone: String(env.WORKSCHEDULE_TIME_ZONE || 'Asia/Seoul'),
    operationalDayStartMin: number(env.WORKSCHEDULE_OPERATIONAL_DAY_START_MIN, 6 * 60, 0, 23 * 60 + 59),
    queryParams: Object.freeze({ singleEvents: 'true', showDeleted: 'true', maxResults: '2500' }),
    reconcileIntervalMs: number(env.WORKSCHEDULE_CALENDAR_RECONCILE_MS, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    reconcileHorizonDays: number(env.WORKSCHEDULE_CALENDAR_HORIZON_DAYS, 120, 7, 730),
    maxAttempts,
    retryBackoffMs,
    maxRetryAfterMs,
    providerAttemptTimeoutMs,
    outboxOperationWindowMs,
    outboxLeaseMs,
    pullLeaseMs: Math.max(
      number(env.WORKSCHEDULE_CALENDAR_PULL_LEASE_MS, 10 * 60 * 1000, 5 * 1000, 30 * 60 * 1000),
      outboxOperationWindowMs + 5000
    ),
    pullSignalLeaseMs: Math.max(
      number(env.WORKSCHEDULE_CALENDAR_PULL_SIGNAL_LEASE_MS, 10 * 60 * 1000, 5 * 1000, 30 * 60 * 1000),
      outboxOperationWindowMs + 5000
    ),
    pullSignalConsumerEnabled: bool(env.WORKSCHEDULE_CALENDAR_PULL_SIGNAL_CONSUMER_ENABLED, true),
    webhookUrl,
    webhookReady: /^https:\/\//i.test(webhookUrl),
    channelRenewBeforeMs: number(env.WORKSCHEDULE_CALENDAR_CHANNEL_RENEW_BEFORE_MS, 24 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    webhookTokenSecret: String(env.GOOGLE_CALENDAR_WEBHOOK_TOKEN || ''),
    adminToken: String(env.WORKSCHEDULE_CALENDAR_ADMIN_TOKEN || ''),
    allowedWebOrigin: String(env.WORKSCHEDULE_WEB_ORIGIN || 'https://wk7007-wk.github.io'),
    overlayProvider: String(env.WORKSCHEDULE_OVERLAY_PROVIDER || 'mock').trim().toLowerCase(),
    overlayApiKey: String(env.PUBLIC_DATA_PORTAL_SERVICE_KEY || ''),
    overlayLiveReady: !!String(env.PUBLIC_DATA_PORTAL_SERVICE_KEY || '').trim()
  };
}

export function publicCalendarSyncStatus(config, runtime = {}) {
  const credentialsConfigured = config.provider !== 'google' || config.googleCredentialsReady === true;
  const tokenConnected = config.provider !== 'google'
    ? true
    : runtime.tokenConnected === true || runtime.connected === true;
  const liveAuthReady = credentialsConfigured && tokenConnected;
  const webhookTokenReady = !!String(config.webhookTokenSecret || '').trim();
  const pushReady = !!(config.webhookReady && webhookTokenReady && config.pullSignalConsumerEnabled && liveAuthReady);
  const blockedReasons = [];
  if (!config.featureEnabled) blockedReasons.push('feature_disabled');
  if (config.killSwitch) blockedReasons.push('kill_switch');
  if (!credentialsConfigured) blockedReasons.push('google_credentials_missing');
  else if (!tokenConnected) blockedReasons.push('google_token_not_connected');
  if (config.pushEnabled && !config.webhookReady) blockedReasons.push('https_webhook_missing');
  if (config.pushEnabled && !webhookTokenReady) blockedReasons.push('webhook_token_missing');
  if (config.pushEnabled && !config.pullSignalConsumerEnabled) blockedReasons.push('pull_signal_consumer_disabled');
  return {
    schema_version: 'workschedule.calendar_sync.public_status.v1',
    provider: config.provider,
    feature_enabled: config.featureEnabled,
    kill_switch: config.killSwitch,
    credentials_configured: credentialsConfigured,
    token_connected: tokenConnected,
    live_auth_ready: liveAuthReady,
    push_enabled: config.pushEnabled,
    push_ready: pushReady,
    periodic_reconciliation: config.periodicPullEnabled,
    overlay_provider: config.overlayProvider,
    overlay_live_ready: config.overlayLiveReady,
    canonical_root: config.canonicalRoot,
    metadata_root: config.metadataRoot,
    overlay_root: config.overlayRoot,
    blocked_reasons: blockedReasons
  };
}
