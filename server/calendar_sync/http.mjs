function response(status, body = '', headers = {}) {
  return { status, headers, body };
}

function safeReturnTo(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/hynix/';
  try {
    const parsed = new URL(path, 'https://same-origin.invalid');
    if (parsed.origin !== 'https://same-origin.invalid' || !parsed.pathname.startsWith('/hynix')) return '/hynix/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_) {
    return '/hynix/';
  }
}

function connectedReturnTo(value) {
  const target = new URL(safeReturnTo(value), 'https://same-origin.invalid');
  target.searchParams.set('calendar', 'connected');
  return target.pathname + target.search + target.hash;
}

export function createCalendarOAuthHttpHandlers({ oauth, isOwner }) {
  if (!oauth || typeof oauth.createAuthorizationUrl !== 'function' || typeof oauth.handleCallback !== 'function') {
    throw new Error('calendar_oauth_flow_required');
  }
  const ownerCheck = typeof isOwner === 'function' ? isOwner : async () => false;
  return {
    async start(request = {}) {
      if (await ownerCheck(request) !== true) {
        return response(403, 'owner_auth_required', { 'content-type': 'text/plain; charset=utf-8' });
      }
      const returnTo = safeReturnTo(request.query && request.query.return_to);
      const location = await oauth.createAuthorizationUrl({ returnTo });
      return response(302, '', { location, 'cache-control': 'no-store' });
    },

    async callback(request = {}) {
      try {
        const result = await oauth.handleCallback({
          code: request.query && request.query.code,
          state: request.query && request.query.state,
          error: request.query && request.query.error
        });
        return response(302, '', {
          location: connectedReturnTo(result && result.returnTo),
          'cache-control': 'no-store'
        });
      } catch (error) {
        return response(400, 'calendar_oauth_failed', { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      }
    }
  };
}

export { safeReturnTo };
