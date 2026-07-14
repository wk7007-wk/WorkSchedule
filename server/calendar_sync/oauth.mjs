import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LiveAuthBlockedError } from './errors.mjs';

function decodeEncryptionKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const hex = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : null;
  if (hex && hex.length === 32) return hex;
  try {
    const base64 = Buffer.from(raw, 'base64');
    return base64.length === 32 ? base64 : null;
  } catch (_) {
    return null;
  }
}

export class MemoryTokenStore {
  constructor(initial = null) {
    this.value = initial ? structuredClone(initial) : null;
  }

  async load() {
    return this.value ? structuredClone(this.value) : null;
  }

  async save(value) {
    this.value = structuredClone(value);
  }

  async clear() {
    this.value = null;
  }
}

export class EncryptedFileTokenStore {
  constructor({ filePath, encryptionKey }) {
    this.filePath = filePath;
    this.key = decodeEncryptionKey(encryptionKey);
    if (!this.key) throw new LiveAuthBlockedError('WORKSCHEDULE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  }

  async load() {
    try {
      const envelope = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      const iv = Buffer.from(envelope.iv, 'base64');
      const tag = Buffer.from(envelope.tag, 'base64');
      const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const envelope = JSON.stringify({
      version: 1,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    });
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = this.filePath + '.tmp-' + process.pid + '-' + Date.now();
    await fs.writeFile(temporary, envelope, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, this.filePath);
    await fs.chmod(this.filePath, 0o600);
  }

  async clear() {
    try { await fs.unlink(this.filePath); } catch (error) { if (!error || error.code !== 'ENOENT') throw error; }
  }
}

export class MemoryOAuthStateStore {
  constructor({ ttlMs = 10 * 60 * 1000, clock = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.states = new Map();
  }

  async issue(metadata = {}) {
    const state = crypto.randomBytes(32).toString('hex');
    this.states.set(state, { metadata: structuredClone(metadata), expiresAtMs: this.clock() + this.ttlMs });
    return state;
  }

  async consume(state) {
    const entry = this.states.get(String(state || ''));
    this.states.delete(String(state || ''));
    if (!entry || entry.expiresAtMs <= this.clock()) return null;
    return structuredClone(entry.metadata);
  }
}

async function parseJsonResponse(response, label) {
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text.slice(0, 300) }; }
  if (!response.ok) throw new Error(label + ' failed with HTTP ' + response.status + ': ' + String(body.error_description || body.error || 'unknown_error'));
  return body;
}

export class GoogleOAuthServerFlow {
  constructor({ config, tokenStore, stateStore, fetchImpl = fetch, clock = () => Date.now() }) {
    this.config = config;
    this.tokenStore = tokenStore;
    this.stateStore = stateStore;
    this.fetch = fetchImpl;
    this.clock = clock;
  }

  assertReady() {
    if (!this.config.googleCredentialsReady) throw new LiveAuthBlockedError();
  }

  async createAuthorizationUrl({ returnTo = '/' } = {}) {
    this.assertReady();
    const state = await this.stateStore.issue({ returnTo });
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      access_type: 'offline',
      include_granted_scopes: 'true',
      scope: this.config.oauthScopes.join(' '),
      state
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  }

  async handleCallback({ code, state, error }) {
    this.assertReady();
    if (error) throw new Error('Google OAuth denied: ' + String(error));
    const stateMetadata = await this.stateStore.consume(state);
    if (!stateMetadata) throw new Error('OAuth state mismatch or expired');
    if (!code) throw new Error('OAuth authorization code is missing');
    const response = await this.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const received = await parseJsonResponse(response, 'OAuth token exchange');
    const previous = await this.tokenStore.load();
    const stored = {
      access_token: received.access_token,
      refresh_token: received.refresh_token || previous && previous.refresh_token || '',
      token_type: received.token_type || 'Bearer',
      scope: received.scope || this.config.oauthScopes.join(' '),
      expires_at_ms: this.clock() + Math.max(0, Number(received.expires_in || 0) * 1000),
      refresh_token_expires_at_ms: received.refresh_token_expires_in
        ? this.clock() + Number(received.refresh_token_expires_in) * 1000
        : previous && previous.refresh_token_expires_at_ms || null,
      updated_at_ms: this.clock()
    };
    if (!stored.refresh_token) throw new Error('Google did not return a refresh token; re-consent with offline access is required');
    await this.tokenStore.save(stored);
    return { connected: true, returnTo: stateMetadata.returnTo || '/', expiresAtMs: stored.expires_at_ms };
  }

  async getAccessToken() {
    this.assertReady();
    const stored = await this.tokenStore.load();
    if (!stored || !stored.refresh_token) throw new LiveAuthBlockedError('Google Calendar refresh token is not stored');
    if (stored.access_token && Number(stored.expires_at_ms || 0) > this.clock() + 60 * 1000) return stored.access_token;
    const response = await this.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: stored.refresh_token,
        grant_type: 'refresh_token'
      })
    });
    const received = await parseJsonResponse(response, 'OAuth token refresh');
    const updated = Object.assign({}, stored, {
      access_token: received.access_token,
      refresh_token: received.refresh_token || stored.refresh_token,
      token_type: received.token_type || stored.token_type || 'Bearer',
      scope: received.scope || stored.scope,
      expires_at_ms: this.clock() + Math.max(0, Number(received.expires_in || 0) * 1000),
      updated_at_ms: this.clock()
    });
    await this.tokenStore.save(updated);
    return updated.access_token;
  }

  async connectionStatus() {
    const stored = await this.tokenStore.load();
    return {
      configured: this.config.googleCredentialsReady,
      connected: !!(stored && stored.refresh_token),
      access_token_cached: !!(stored && stored.access_token),
      expires_at_ms: stored && stored.expires_at_ms || null
    };
  }
}
