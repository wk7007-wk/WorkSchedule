import crypto from 'node:crypto';
import { DestinationCollisionError, FeatureDisabledError, EtagConflictError } from './errors.mjs';
import {
  calendarCoreLogic,
  canonicalKey,
  deterministicGoogleEventId,
  googleEventToCanonical,
  listResolvedCanonicalEvents,
  mappingIdForCanonicalKey,
  projectCanonicalToGoogleEvent,
  revisionOf
} from './domain.mjs';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const target = name.toLowerCase();
  const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === target);
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] : String(value || '');
}

function todayInZone(nowMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(nowMs)).reduce((out, part) => {
      if (part.type !== 'literal') out[part.type] = part.value;
      return out;
    }, {});
  return parts.year + '-' + parts.month + '-' + parts.day;
}

export class CalendarSyncEngine {
  constructor({ config, store, provider, clock = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), workerId = crypto.randomUUID() }) {
    this.config = config;
    this.store = store;
    this.provider = provider;
    this.clock = clock;
    this.sleep = sleep;
    this.workerId = String(workerId);
  }

  assertRunnable() {
    if (!this.config.featureEnabled) throw new FeatureDisabledError('feature_disabled');
    if (this.config.killSwitch) throw new FeatureDisabledError('kill_switch');
    if (this.config.liveAuthBlocked) throw new FeatureDisabledError('live_auth_blocked');
  }

  publicRunState() {
    const reasons = [];
    if (!this.config.featureEnabled) reasons.push('feature_disabled');
    if (this.config.killSwitch) reasons.push('kill_switch');
    if (this.config.liveAuthBlocked) reasons.push('live_auth_blocked');
    return { runnable: reasons.length === 0, blockedReasons: reasons };
  }

  async audit(action, details = {}) {
    const nowMs = this.clock();
    return await this.store.appendAudit(Object.assign({
      schema_version: 'workschedule.calendar_sync.audit.v1',
      action,
      at_ms: nowMs,
      at: new Date(nowMs).toISOString(),
      provider: this.config.provider,
      canonical_root: this.config.canonicalRoot,
      metadata_root: this.config.metadataRoot
    }, clone(details)));
  }

  async conflict(kind, details = {}) {
    const nowMs = this.clock();
    return await this.store.appendConflict(Object.assign({
      schema_version: 'workschedule.calendar_sync.conflict.v1',
      kind,
      status: 'manual_review_required',
      at_ms: nowMs,
      at: new Date(nowMs).toISOString()
    }, clone(details)));
  }

  async withRetry(label, work) {
    let attempt = 0;
    while (attempt < this.config.maxAttempts) {
      try {
        return await work(attempt);
      } catch (error) {
        attempt += 1;
        if (!error || error.retryable !== true || attempt >= this.config.maxAttempts) throw error;
        const configured = this.config.retryBackoffMs[Math.min(attempt - 1, this.config.retryBackoffMs.length - 1)] || 1000;
        const delayMs = Number.isFinite(error.retryAfterMs) ? Math.max(configured, error.retryAfterMs) : configured;
        await this.audit('provider_retry', { label, attempt, delay_ms: delayMs, error_code: error.code || 'retryable_error' });
        await this.sleep(delayMs);
      }
    }
    throw new Error(label + ' exhausted retries');
  }

  async discoverMapping(entity) {
    const known = await this.store.getMapping(entity.canonicalKey);
    if (known) return known;
    const matches = (await this.provider.listByPrivateProperty('wsCanonicalKey', entity.canonicalKey))
      .filter(event => event && event.status !== 'cancelled');
    if (matches.length > 1) {
      await this.conflict('duplicate_google_projection', { canonical_key: entity.canonicalKey, event_ids: matches.map(event => event.id) });
      throw new EtagConflictError('Multiple Google events map to one canonical schedule row');
    }
    if (!matches.length) return null;
    const event = matches[0];
    return await this.store.setMapping(entity.canonicalKey, {
      mappingId: mappingIdForCanonicalKey(entity.canonicalKey),
      eventId: event.id,
      googleEtag: event.etag || '',
      googleUpdated: event.updated || '',
      canonicalRevision: String(entity.revision),
      employeeId: entity.employeeId,
      date: entity.date,
      source: entity.source,
      discoveredAtMs: this.clock()
    });
  }

  async getEventIfPresent(eventId) {
    try {
      return await this.provider.getEvent(eventId);
    } catch (error) {
      if (error && error.status === 404) return null;
      throw error;
    }
  }

  verifyRecoveredInsert(event, canonicalKeyValue) {
    const privateProps = event && event.extendedProperties && event.extendedProperties.private || {};
    if (!event || event.status === 'cancelled' || String(privateProps.wsCanonicalKey || '') !== String(canonicalKeyValue)) {
      throw new EtagConflictError('Deterministic Google event ID belongs to another or cancelled event');
    }
    return event;
  }

  async insertCanonicalEvent(entity, projected, label, identity = entity.canonicalKey) {
    const eventId = deterministicGoogleEventId(identity);
    const body = Object.assign({}, projected, { id: eventId });
    return await this.withRetry(label, async () => {
      const existing = await this.getEventIfPresent(eventId);
      if (existing && existing.status !== 'cancelled') return this.verifyRecoveredInsert(existing, entity.canonicalKey);
      try {
        return await this.provider.insertEvent(body);
      } catch (error) {
        if (error && error.status === 409) {
          const recovered = await this.getEventIfPresent(eventId);
          if (recovered) return this.verifyRecoveredInsert(recovered, entity.canonicalKey);
        }
        throw error;
      }
    });
  }

  async pushCanonicalEntity(entity, reason = 'outbox') {
    const mapping = await this.discoverMapping(entity);
    if (entity.state === 'clear' || entity.state === 'missing' || entity.missing) {
      if (!mapping || !mapping.eventId) {
        await this.audit('canonical_tombstone_no_remote', { canonical_key: entity.canonicalKey, reason });
        return { status: 'noop_tombstone' };
      }
      const remote = await this.provider.getEvent(mapping.eventId);
      if (remote && remote.status !== 'cancelled') {
        if (mapping.googleEtag && remote.etag !== mapping.googleEtag && String(entity.revision) !== String(mapping.canonicalRevision)) {
          await this.conflict('concurrent_delete', { canonical_key: entity.canonicalKey, event_id: mapping.eventId, canonical_revision: entity.revision, mapped_revision: mapping.canonicalRevision, remote_etag: remote.etag, mapped_etag: mapping.googleEtag });
          throw new EtagConflictError('Both canonical row and Google event changed before delete');
        }
        await this.withRetry('delete_event', () => this.provider.deleteEvent(mapping.eventId, remote.etag || mapping.googleEtag));
      }
      await this.store.setMapping(entity.canonicalKey, Object.assign({}, mapping, {
        tombstone: true,
        canonicalRevision: String(entity.revision || ''),
        deletedAtMs: this.clock()
      }));
      await this.audit('google_event_deleted', { canonical_key: entity.canonicalKey, event_id: mapping.eventId, reason });
      return { status: 'deleted', eventId: mapping.eventId };
    }

    const projected = projectCanonicalToGoogleEvent(entity, {
      locationName: this.config.locationName,
      timeZone: this.config.timeZone,
      operationalDayStartMin: this.config.operationalDayStartMin
    });
    if (!mapping || !mapping.eventId || mapping.tombstone) {
      const identity = mapping && mapping.tombstone
        ? entity.canonicalKey + '|reinsert|' + String(entity.revision)
        : entity.canonicalKey;
      const created = await this.insertCanonicalEvent(entity, projected, 'insert_event', identity);
      await this.store.setMapping(entity.canonicalKey, {
        mappingId: entity.mappingId || mappingIdForCanonicalKey(entity.canonicalKey),
        eventId: created.id,
        googleEtag: created.etag || '',
        googleUpdated: created.updated || '',
        canonicalRevision: String(entity.revision),
        employeeId: entity.employeeId,
        date: entity.date,
        source: entity.source,
        tombstone: false,
        syncedAtMs: this.clock()
      });
      await this.audit('google_event_inserted', { canonical_key: entity.canonicalKey, event_id: created.id, canonical_revision: entity.revision, reason });
      return { status: 'inserted', eventId: created.id };
    }

    const remote = await this.getEventIfPresent(mapping.eventId);
    if (!remote || remote.status === 'cancelled') {
      const created = await this.insertCanonicalEvent(
        entity,
        projected,
        'reinsert_event',
        entity.canonicalKey + '|reinsert|' + String(entity.revision)
      );
      await this.store.setMapping(entity.canonicalKey, Object.assign({}, mapping, {
        eventId: created.id,
        googleEtag: created.etag || '',
        googleUpdated: created.updated || '',
        canonicalRevision: String(entity.revision),
        tombstone: false,
        syncedAtMs: this.clock()
      }));
      await this.audit('google_event_reinserted', { canonical_key: entity.canonicalKey, event_id: created.id, reason });
      return { status: 'reinserted', eventId: created.id };
    }

    const canonicalChanged = String(entity.revision) !== String(mapping.canonicalRevision);
    const googleChanged = !!mapping.googleEtag && remote.etag !== mapping.googleEtag;
    if (canonicalChanged && googleChanged) {
      await this.conflict('etag_revision_conflict', {
        canonical_key: entity.canonicalKey,
        event_id: mapping.eventId,
        canonical_revision: entity.revision,
        mapped_revision: mapping.canonicalRevision,
        remote_etag: remote.etag,
        mapped_etag: mapping.googleEtag
      });
      throw new EtagConflictError('Canonical revision and Google ETag both changed');
    }
    if (!canonicalChanged) {
      if (googleChanged) {
        await this.audit('outbox_deferred_to_google_pull', { canonical_key: entity.canonicalKey, event_id: mapping.eventId, reason });
        return { status: 'google_change_pending_pull', eventId: mapping.eventId };
      }
      return { status: 'idempotent', eventId: mapping.eventId };
    }
    const updated = await this.withRetry('update_event', () => this.provider.updateEvent(mapping.eventId, projected, remote.etag || mapping.googleEtag));
    await this.store.setMapping(entity.canonicalKey, Object.assign({}, mapping, {
      googleEtag: updated.etag || '',
      googleUpdated: updated.updated || '',
      canonicalRevision: String(entity.revision),
      employeeId: entity.employeeId,
      date: entity.date,
      source: entity.source,
      tombstone: false,
      syncedAtMs: this.clock()
    }));
    await this.audit('google_event_updated', { canonical_key: entity.canonicalKey, event_id: mapping.eventId, canonical_revision: entity.revision, reason });
    return { status: 'updated', eventId: mapping.eventId };
  }

  async reconcileCanonicalWindow({ reason = 'periodic', startDate = null, endDate = null } = {}) {
    this.assertRunnable();
    const nowMs = this.clock();
    const start = startDate || todayInZone(nowMs, this.config.timeZone);
    const end = endDate || calendarCoreLogic.dateKey(calendarCoreLogic.addDays(start, this.config.reconcileHorizonDays - 1));
    const snapshot = await this.store.getSnapshot();
    const entities = listResolvedCanonicalEvents(snapshot, start, end);
    const expected = new Set(entities.map(entity => entity.canonicalKey));
    const results = [];
    for (const entity of entities) results.push(await this.pushCanonicalEntity(entity, reason));
    if (typeof this.store.listMappings === 'function') {
      const mappings = await this.store.listMappings();
      for (const mapping of mappings) {
        if (!mapping || mapping.tombstone || !mapping.date || mapping.date < start || mapping.date > end || expected.has(mapping.canonicalKey)) continue;
        results.push(await this.pushCanonicalEntity({
          canonicalKey: mapping.canonicalKey,
          mappingId: mapping.mappingId,
          date: mapping.date,
          employeeId: mapping.employeeId,
          state: 'clear',
          source: 'reconciliation_tombstone',
          revision: 'clear-' + nowMs
        }, reason));
      }
    }
    await this.audit('canonical_reconciliation_complete', { reason, start_date: start, end_date: end, projected_count: entities.length });
    return { startDate: start, endDate: end, projectedCount: entities.length, results };
  }

  async processOutbox({ limit = 50 } = {}) {
    this.assertRunnable();
    const items = await this.store.claimOutbox({
      nowMs: this.clock(),
      limit,
      leaseMs: Number.isFinite(this.config.outboxLeaseMs) ? this.config.outboxLeaseMs : 60000,
      ownerId: this.workerId
    });
    const results = [];
    let fixedReconciled = false;
    for (const item of items) {
      try {
        let result;
        if (item.entity === 'fixed_schedule') {
          result = fixedReconciled ? { status: 'coalesced_fixed_reconcile' } : await this.reconcileCanonicalWindow({ reason: 'fixed_schedule_outbox' });
          fixedReconciled = true;
        } else {
          const entity = await this.store.getCanonicalForOutbox(item);
          result = await this.pushCanonicalEntity(entity, 'outbox');
        }
        const finished = await this.store.finishOutbox(item.id, item, {
          status: 'done', completed_at_ms: this.clock(), result: result.status || 'reconciled'
        });
        results.push(finished
          ? { id: item.id, ok: true, result }
          : { id: item.id, ok: false, staleFence: true, result });
      } catch (error) {
        const attempts = Number(item.attempt_count || 0) + 1;
        const conflict = error instanceof EtagConflictError || error && error.code === 'etag_conflict';
        const retry = !conflict && error && error.retryable === true && attempts < this.config.maxAttempts;
        const backoff = this.config.retryBackoffMs[Math.min(attempts - 1, this.config.retryBackoffMs.length - 1)] || 60000;
        const finished = await this.store.finishOutbox(item.id, item, {
          status: conflict ? 'conflict' : retry ? 'retry' : 'failed',
          attempt_count: attempts,
          last_error: String(error && (error.code || error.message) || 'unknown_error').slice(0, 240),
          next_attempt_at_ms: retry ? this.clock() + backoff : null,
          failed_at_ms: retry ? null : this.clock()
        });
        results.push({ id: item.id, ok: false, conflict, retry, staleFence: !finished });
      }
    }
    return { processed: items.length, results };
  }

  async applyGoogleEvent(event, snapshot) {
    await this.store.putMirror(event.id, event);
    const privateProps = event && event.extendedProperties && event.extendedProperties.private || {};
    const key = String(privateProps.wsCanonicalKey || '');
    let mapping = key ? await this.store.getMapping(key) : null;
    if (!mapping) mapping = await this.store.getMappingByEventId(event.id);
    if (mapping && mapping.googleEtag && mapping.googleEtag === event.etag) return { status: 'already_applied' };
    const change = googleEventToCanonical(event, {
      employees: snapshot.employees || {},
      mapping,
      timeZone: this.config.timeZone,
      operationalDayStartMin: this.config.operationalDayStartMin
    });
    if (change.ignored || change.action === 'unsupported_all_day') {
      await this.audit('google_event_ignored', { event_id: event.id || '', reason: change.reason || change.action || 'unsupported' });
      return { status: 'ignored', reason: change.reason || change.action };
    }
    const priorKey = mapping && mapping.canonicalKey || key || canonicalKey(change.priorDate || change.date, change.employeeId);
    const currentRevision = await this.store.getCanonicalRevision(priorKey);
    const canonicalChanged = !!mapping && String(currentRevision) !== String(mapping.canonicalRevision);
    const googleChanged = !mapping || !mapping.googleEtag || mapping.googleEtag !== event.etag;
    if (mapping && canonicalChanged && googleChanged) {
      await this.conflict('pull_revision_conflict', {
        canonical_key: priorKey,
        event_id: event.id,
        canonical_revision: currentRevision,
        mapped_revision: mapping.canonicalRevision,
        remote_etag: event.etag,
        mapped_etag: mapping.googleEtag
      });
      return { status: 'conflict' };
    }
    let destinationExpectation = null;
    if (change.action === 'move') {
      destinationExpectation = await this.store.getExplicitOverrideState(change.date, change.employeeId);
      const destinationEventId = String(destinationExpectation.googleEventId || '');
      if (destinationExpectation.exists && destinationEventId !== String(event.id || '')) {
        await this.conflict('move_destination_occupied', {
          event_id: event.id,
          prior_canonical_key: priorKey,
          destination_canonical_key: change.canonicalKey,
          destination_revision: destinationExpectation.revision
        });
        return { status: 'conflict', reason: 'move_destination_occupied' };
      }
    }
    let written;
    try {
      written = await this.store.writeImportedChange(change, {
        nowMs: this.clock(),
        expectedRevision: change.action === 'move' ? null : currentRevision,
        destinationExpectation
      });
    } catch (error) {
      if (!(error instanceof DestinationCollisionError) && (!error || error.code !== 'move_destination_occupied')) throw error;
      await this.conflict('move_destination_occupied', {
        event_id: event.id,
        prior_canonical_key: priorKey,
        destination_canonical_key: change.canonicalKey,
        reason: 'destination_changed_during_write'
      });
      return { status: 'conflict', reason: 'move_destination_occupied' };
    }
    const newKey = change.canonicalKey;
    if (mapping && priorKey !== newKey) await this.store.deleteMapping(priorKey);
    await this.store.setMapping(newKey, {
      mappingId: privateProps.wsMappingId || mapping && mapping.mappingId || mappingIdForCanonicalKey(newKey),
      eventId: event.id,
      googleEtag: event.etag || '',
      googleUpdated: event.updated || '',
      canonicalRevision: revisionOf(written),
      employeeId: change.employeeId,
      date: change.date,
      source: 'google_calendar',
      tombstone: change.action === 'clear',
      syncedAtMs: this.clock()
    });
    await this.audit('google_event_imported', { event_id: event.id, canonical_key: newKey, action: change.action, prior_date: change.priorDate || null });
    return { status: 'imported', action: change.action, canonicalKey: newKey };
  }

  async pullChanges({ reason = 'periodic', recoveredFromGone = false } = {}) {
    this.assertRunnable();
    let state = await this.store.getSyncState();
    const queryFingerprint = stableJson(this.config.queryParams);
    if (state.query_fingerprint && state.query_fingerprint !== queryFingerprint) {
      await this.store.clearMirror();
      await this.store.setSyncState({ sync_token: null, query_fingerprint: queryFingerprint, reset_reason: 'query_params_changed', reset_at_ms: this.clock() });
      state = await this.store.getSyncState();
    }
    const syncToken = state.sync_token || null;
    const snapshot = await this.store.getSnapshot();
    let pageToken = null;
    let nextSyncToken = null;
    let itemCount = 0;
    try {
      do {
        const page = await this.withRetry('list_events', () => this.provider.listEventsPage({
          queryParams: this.config.queryParams,
          syncToken,
          pageToken
        }));
        for (const event of page && page.items || []) {
          await this.applyGoogleEvent(event, snapshot);
          itemCount += 1;
        }
        pageToken = page && page.nextPageToken || null;
        if (!pageToken) nextSyncToken = page && page.nextSyncToken || null;
      } while (pageToken);
    } catch (error) {
      if (error && error.code === 'sync_token_gone' && !recoveredFromGone) {
        await this.store.clearMirror();
        await this.store.setSyncState({ sync_token: null, query_fingerprint: queryFingerprint, reset_reason: 'google_410', reset_at_ms: this.clock() });
        await this.audit('sync_token_410_full_resync', { reason });
        return await this.pullChanges({ reason: '410_full_resync', recoveredFromGone: true });
      }
      throw error;
    }
    if (!nextSyncToken) throw new Error('Google Calendar did not return nextSyncToken on the final page');
    await this.store.setSyncState({
      sync_token: nextSyncToken,
      query_fingerprint: queryFingerprint,
      query_params: clone(this.config.queryParams),
      last_pull_at_ms: this.clock(),
      last_pull_reason: reason,
      last_pull_count: itemCount
    });
    await this.audit('google_incremental_pull_complete', { reason, mode: syncToken ? 'incremental' : 'full', item_count: itemCount, recovered_from_410: recoveredFromGone });
    return { mode: syncToken ? 'incremental' : 'full', itemCount, nextSyncToken, recoveredFromGone };
  }

  async acceptWebhook(headers) {
    const channel = await this.store.getChannel();
    const channelId = header(headers, 'x-goog-channel-id');
    const resourceId = header(headers, 'x-goog-resource-id');
    const token = header(headers, 'x-goog-channel-token');
    const state = header(headers, 'x-goog-resource-state');
    const messageNumber = header(headers, 'x-goog-message-number');
    if (!channel || channel.id !== channelId || channel.resourceId !== resourceId || !safeEqual(channel.token, token)) {
      await this.audit('google_webhook_rejected', { channel_id: channelId, resource_id: resourceId, state, reason: 'channel_or_token_mismatch' });
      return { accepted: false, status: 403 };
    }
    await this.store.enqueuePullSignal({
      schema_version: 'workschedule.calendar_sync.pull_signal.v1',
      source: 'google_push_webhook',
      channel_id: channelId,
      resource_id: resourceId,
      resource_state: state,
      message_number: messageNumber,
      at_ms: this.clock(),
      status: 'pending'
    });
    await this.audit('google_webhook_signal_accepted', { channel_id: channelId, resource_id: resourceId, state, message_number: messageNumber });
    return { accepted: true, status: 204 };
  }

  async processPullSignals({ limit = 50 } = {}) {
    this.assertRunnable();
    if (!this.config.pullSignalConsumerEnabled) return { status: 'disabled', processed: 0, results: [] };
    const signals = await this.store.claimPullSignals({
      nowMs: this.clock(),
      limit,
      leaseMs: Number.isFinite(this.config.pullSignalLeaseMs) ? this.config.pullSignalLeaseMs : 60000,
      ownerId: this.workerId
    });
    if (!signals.length) return { status: 'idle', processed: 0, results: [] };
    try {
      const pull = await this.pullChanges({ reason: 'google_push_signal' });
      const results = [];
      for (const signal of signals) {
        const finished = await this.store.finishPullSignal(signal.id, signal, {
          status: 'done', completed_at_ms: this.clock(), pull_sync_token: pull.nextSyncToken
        });
        results.push({ id: signal.id, ok: !!finished, staleFence: !finished });
      }
      await this.audit('google_push_signals_consumed', { signal_count: signals.length, item_count: pull.itemCount });
      return { status: 'pulled', processed: signals.length, pull, results };
    } catch (error) {
      const results = [];
      for (const signal of signals) {
        const attempts = Number(signal.attempt_count || 0) + 1;
        const retry = error && error.retryable === true && attempts < this.config.maxAttempts;
        const backoff = this.config.retryBackoffMs[Math.min(attempts - 1, this.config.retryBackoffMs.length - 1)] || 60000;
        const finished = await this.store.finishPullSignal(signal.id, signal, {
          status: retry ? 'retry' : 'failed',
          attempt_count: attempts,
          next_attempt_at_ms: retry ? this.clock() + backoff : null,
          last_error: String(error && (error.code || error.message) || 'pull_signal_error').slice(0, 240)
        });
        results.push({ id: signal.id, ok: false, retry, staleFence: !finished });
      }
      return { status: 'failed', processed: signals.length, error: error && (error.code || error.message), results };
    }
  }

  async ensurePushChannel() {
    this.assertRunnable();
    if (!this.config.pushEnabled) return { status: 'disabled' };
    if (!this.config.webhookReady || !this.config.webhookTokenSecret) return { status: 'blocked', reason: 'https_webhook_or_token_missing' };
    const current = await this.store.getChannel();
    if (current && Number(current.expirationMs || 0) > this.clock() + this.config.channelRenewBeforeMs) return { status: 'current', channel: current };
    const channelId = crypto.randomUUID();
    const expirationMs = this.clock() + 7 * 24 * 60 * 60 * 1000;
    const created = await this.provider.watchEvents({
      channelId,
      address: this.config.webhookUrl,
      token: this.config.webhookTokenSecret,
      expirationMs
    });
    const row = {
      id: channelId,
      resourceId: created.resourceId,
      resourceUri: created.resourceUri || '',
      token: this.config.webhookTokenSecret,
      expirationMs: Number(created.expiration || expirationMs),
      createdAtMs: this.clock()
    };
    await this.store.setChannel(row);
    if (current && current.id && current.resourceId) {
      try { await this.provider.stopChannel({ channelId: current.id, resourceId: current.resourceId }); }
      catch (error) { await this.audit('old_push_channel_stop_failed', { channel_id: current.id, error: String(error.message || error).slice(0, 160) }); }
    }
    await this.audit('google_push_channel_created', { channel_id: row.id, resource_id: row.resourceId, expiration_ms: row.expirationMs });
    return { status: 'created', channel: row };
  }

  async runCycle({ reason = 'periodic' } = {}) {
    this.assertRunnable();
    const pullSignals = await this.processPullSignals();
    const pull = pullSignals.status === 'pulled'
      ? pullSignals.pull
      : await this.pullChanges({ reason });
    const outbox = await this.processOutbox();
    const channel = await this.ensurePushChannel();
    return { pull, pullSignals, outbox, channel };
  }
}
