import { EtagConflictError, GoneSyncTokenError, RetryableProviderError } from './errors.mjs';

function retryAfterMs(response) {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function responseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return { raw: text.slice(0, 500) }; }
}

export class GoogleCalendarProvider {
  constructor({ calendarId, oauth, fetchImpl = fetch, apiBase = 'https://www.googleapis.com/calendar/v3' }) {
    this.calendarId = calendarId;
    this.oauth = oauth;
    this.fetch = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, '');
  }

  calendarPath(suffix = '') {
    return this.apiBase + '/calendars/' + encodeURIComponent(this.calendarId) + suffix;
  }

  async request(url, options = {}) {
    const accessToken = await this.oauth.getAccessToken();
    const headers = Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + accessToken });
    const response = await this.fetch(url, Object.assign({}, options, { headers }));
    const body = await responseBody(response);
    if (response.ok) return body;
    const message = String(body && body.error && body.error.message || body && body.error_description || 'Google Calendar request failed');
    if (response.status === 410) throw new GoneSyncTokenError(message);
    if (response.status === 412) throw new EtagConflictError(message);
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableProviderError(message, { status: response.status, retryAfterMs: retryAfterMs(response), details: body && body.error && body.error.status || null });
    }
    const error = new Error(message);
    error.status = response.status;
    error.details = body && body.error && body.error.status || null;
    throw error;
  }

  async listEventsPage({ queryParams, syncToken = null, pageToken = null }) {
    const params = new URLSearchParams();
    Object.keys(queryParams || {}).sort().forEach(key => params.set(key, String(queryParams[key])));
    if (syncToken) params.set('syncToken', String(syncToken));
    if (pageToken) params.set('pageToken', String(pageToken));
    return await this.request(this.calendarPath('/events?') + params.toString());
  }

  async listByPrivateProperty(key, value) {
    const params = new URLSearchParams({
      privateExtendedProperty: String(key) + '=' + String(value),
      showDeleted: 'true',
      maxResults: '50'
    });
    const result = await this.request(this.calendarPath('/events?') + params.toString());
    return result && Array.isArray(result.items) ? result.items : [];
  }

  async getEvent(eventId) {
    return await this.request(this.calendarPath('/events/') + encodeURIComponent(eventId));
  }

  async insertEvent(event) {
    return await this.request(this.calendarPath('/events'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
  }

  async updateEvent(eventId, event, etag) {
    const headers = { 'Content-Type': 'application/json' };
    if (etag) headers['If-Match'] = etag;
    return await this.request(this.calendarPath('/events/') + encodeURIComponent(eventId), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(event)
    });
  }

  async deleteEvent(eventId, etag) {
    const headers = {};
    if (etag) headers['If-Match'] = etag;
    await this.request(this.calendarPath('/events/') + encodeURIComponent(eventId), { method: 'DELETE', headers });
    return { id: eventId, status: 'cancelled' };
  }

  async watchEvents({ channelId, address, token, expirationMs }) {
    return await this.request(this.calendarPath('/events/watch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: channelId, type: 'web_hook', address, token, expiration: String(expirationMs) })
    });
  }

  async stopChannel({ channelId, resourceId }) {
    return await this.request(this.apiBase + '/channels/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: channelId, resourceId })
    });
  }
}
