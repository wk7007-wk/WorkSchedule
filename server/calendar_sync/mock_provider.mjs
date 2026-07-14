import { EtagConflictError, GoneSyncTokenError } from './errors.mjs';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export class MockCalendarProvider {
  constructor({ pageSize = 100, clock = () => Date.now() } = {}) {
    this.pageSize = pageSize;
    this.clock = clock;
    this.events = new Map();
    this.changes = [];
    this.version = 0;
    this.nextId = 1;
    this.invalidSyncTokens = new Set();
    this.calls = [];
    this.channels = new Map();
  }

  etag() {
    return '"mock-' + this.version + '"';
  }

  recordChange(event) {
    this.version += 1;
    const next = Object.assign({}, clone(event), { etag: '"mock-' + this.version + '"', updated: new Date(this.clock()).toISOString() });
    this.events.set(next.id, next);
    this.changes.push({ version: this.version, event: clone(next) });
    return clone(next);
  }

  pageToken(offset, upperVersion, lowerVersion) {
    return Buffer.from(JSON.stringify({ offset, upperVersion, lowerVersion })).toString('base64url');
  }

  parsePageToken(value) {
    return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
  }

  async listEventsPage({ queryParams, syncToken = null, pageToken = null }) {
    this.calls.push({ method: 'listEventsPage', queryParams: clone(queryParams || {}), syncToken, pageToken });
    if (syncToken && this.invalidSyncTokens.has(syncToken)) throw new GoneSyncTokenError();
    const lowerVersion = syncToken ? Number(String(syncToken).replace(/^sync-/, '')) : 0;
    if (syncToken && !Number.isFinite(lowerVersion)) throw new GoneSyncTokenError();
    const page = pageToken ? this.parsePageToken(pageToken) : { offset: 0, upperVersion: this.version, lowerVersion };
    const all = syncToken
      ? this.changes.filter(change => change.version > page.lowerVersion && change.version <= page.upperVersion).map(change => change.event)
      : Array.from(this.events.values()).filter(event => event.status !== 'cancelled' || String(queryParams && queryParams.showDeleted) === 'true');
    const deduped = [];
    const latest = new Map();
    all.forEach(event => latest.set(event.id, event));
    latest.forEach(event => deduped.push(clone(event)));
    deduped.sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const items = deduped.slice(page.offset, page.offset + this.pageSize);
    const nextOffset = page.offset + items.length;
    return {
      items,
      nextPageToken: nextOffset < deduped.length ? this.pageToken(nextOffset, page.upperVersion, page.lowerVersion) : null,
      nextSyncToken: nextOffset >= deduped.length ? 'sync-' + page.upperVersion : null
    };
  }

  async listByPrivateProperty(key, value) {
    this.calls.push({ method: 'listByPrivateProperty', key, value });
    return Array.from(this.events.values()).filter(event => {
      const privateProps = event.extendedProperties && event.extendedProperties.private || {};
      return String(privateProps[key] || '') === String(value);
    }).map(clone);
  }

  async getEvent(eventId) {
    this.calls.push({ method: 'getEvent', eventId });
    return clone(this.events.get(eventId) || null);
  }

  async insertEvent(event) {
    this.calls.push({ method: 'insertEvent', event: clone(event) });
    const id = 'mock-event-' + this.nextId++;
    return this.recordChange(Object.assign({}, clone(event), { id, status: event.status || 'confirmed' }));
  }

  async updateEvent(eventId, patch, etag) {
    this.calls.push({ method: 'updateEvent', eventId, etag, event: clone(patch) });
    const current = this.events.get(eventId);
    if (!current) throw new Error('mock event not found');
    if (etag && etag !== current.etag) throw new EtagConflictError();
    return this.recordChange(Object.assign({}, current, clone(patch), { id: eventId }));
  }

  async deleteEvent(eventId, etag) {
    this.calls.push({ method: 'deleteEvent', eventId, etag });
    const current = this.events.get(eventId);
    if (!current) return { id: eventId, status: 'cancelled' };
    if (etag && etag !== current.etag) throw new EtagConflictError();
    return this.recordChange(Object.assign({}, current, { status: 'cancelled', deleted: true }));
  }

  async simulateExternalEdit(eventId, patch) {
    const current = this.events.get(eventId);
    if (!current) throw new Error('mock event not found');
    return this.recordChange(Object.assign({}, current, clone(patch), { id: eventId }));
  }

  async seedEvent(event) {
    const id = event.id || 'mock-event-' + this.nextId++;
    return this.recordChange(Object.assign({}, clone(event), { id, status: event.status || 'confirmed' }));
  }

  invalidateSyncToken(token) {
    this.invalidSyncTokens.add(token);
  }

  async watchEvents(channel) {
    const row = Object.assign({}, clone(channel), {
      resourceId: 'mock-resource-' + channel.channelId,
      resourceUri: 'mock://calendar/events',
      expiration: channel.expirationMs
    });
    this.channels.set(channel.channelId, row);
    return clone(row);
  }

  async stopChannel({ channelId }) {
    this.channels.delete(channelId);
    return null;
  }
}
