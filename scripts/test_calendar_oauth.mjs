import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCalendarSyncConfig, publicCalendarSyncStatus } from '../server/calendar_sync/config.mjs';
import { EncryptedFileTokenStore, GoogleOAuthServerFlow, MemoryOAuthStateStore, MemoryTokenStore } from '../server/calendar_sync/oauth.mjs';

let nowMs = 1000;
const config = loadCalendarSyncConfig({
  WORKSCHEDULE_CALENDAR_PROVIDER: 'google',
  WORKSCHEDULE_CALENDAR_SYNC_ENABLED: 'true',
  WORKSCHEDULE_CALENDAR_KILL_SWITCH: 'false',
  GOOGLE_OAUTH_CLIENT_ID: 'server-client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'server-client-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://sync.example.test/oauth/google/callback',
  GOOGLE_CALENDAR_ID: 'calendar@example.test',
  WORKSCHEDULE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
});
assert.equal(config.googleCredentialsReady, true);
assert.equal(config.liveAuthBlocked, false);
const publicStatus = publicCalendarSyncStatus(config);
assert.equal('clientSecret' in publicStatus, false);
assert.equal('tokenEncryptionKey' in publicStatus, false);

const calls = [];
const responses = [
  { access_token: 'access-1', refresh_token: 'refresh-secret', expires_in: 1, token_type: 'Bearer' },
  { access_token: 'access-2', expires_in: 3600, token_type: 'Bearer' }
];
const fakeFetch = async (url, options) => {
  calls.push({ url, options });
  const body = responses.shift();
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};
const tokenStore = new MemoryTokenStore();
const stateStore = new MemoryOAuthStateStore({ clock: () => nowMs });
const oauth = new GoogleOAuthServerFlow({ config, tokenStore, stateStore, fetchImpl: fakeFetch, clock: () => nowMs });
const authorizationUrl = await oauth.createAuthorizationUrl({ returnTo: '/settings' });
const parsed = new URL(authorizationUrl);
assert.equal(parsed.searchParams.get('client_id'), 'server-client-id');
assert.equal(parsed.searchParams.get('access_type'), 'offline');
assert.ok(parsed.searchParams.get('state'));
assert.equal(parsed.searchParams.has('client_secret'), false, 'client secret must never enter a browser URL');
await assert.rejects(() => oauth.handleCallback({ code: 'code', state: 'wrong' }), /state mismatch/i);
const connected = await oauth.handleCallback({ code: 'code', state: parsed.searchParams.get('state') });
assert.equal(connected.connected, true);
assert.equal((await tokenStore.load()).refresh_token, 'refresh-secret');
assert.match(String(calls[0].options.body), /client_secret=server-client-secret/);

nowMs = 5000;
assert.equal(await oauth.getAccessToken(), 'access-2');
assert.equal((await tokenStore.load()).refresh_token, 'refresh-secret', 'refresh rotation must preserve an omitted refresh token');

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'workschedule-token-'));
const encryptedPath = path.join(temp, 'token.enc');
const encrypted = new EncryptedFileTokenStore({ filePath: encryptedPath, encryptionKey: config.tokenEncryptionKey });
await encrypted.save({ refresh_token: 'never-plaintext', access_token: 'also-secret' });
const ciphertext = await fs.readFile(encryptedPath, 'utf8');
assert.doesNotMatch(ciphertext, /never-plaintext|also-secret/);
assert.deepEqual(await encrypted.load(), { refresh_token: 'never-plaintext', access_token: 'also-secret' });
await fs.rm(temp, { recursive: true, force: true });

const blocked = publicCalendarSyncStatus(loadCalendarSyncConfig({ WORKSCHEDULE_CALENDAR_PROVIDER: 'google' }));
assert.ok(blocked.blocked_reasons.includes('live_auth_missing'));
assert.ok(blocked.blocked_reasons.includes('kill_switch'));

console.log('calendar oauth ok');
