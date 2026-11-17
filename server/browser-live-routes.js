// The routes of the live screen of the browser agent (design doc sections 6 and 16; P3b). The page asks here, signed in as the person the browser belongs to:
//   POST   /v1/browser/:sessionId/viewer             -> { viewerId, token, host, wsPath, ratioSizes }  (a temporary member of the browser's neko; the page then opens wss://host + wsPath)
//   DELETE /v1/browser/:sessionId/viewer/:viewerId   -> { ok }
//   POST   /v1/browser/:sessionId/control            { mode: 'user' | 'model', viewerId? } -> { control }
//   POST   /v1/browser/:sessionId/tabs               { op: 'list' | 'new' | 'close' | 'activate' | 'reload' | 'back' | 'navigate', tabId?, url? } -> { tabs?, tabId?, url? }
//   POST   /v1/browser/:sessionId/screen             { ratio: '4:3' | '16:9' | 'portrait' } -> { ratio, width, height }
// Only the owner of a browser reaches it (browser-sessions.js checks that); a person who may not use the browser agent gets nothing. The host's address, its secret and the passwords of the
// viewers never leave the server: the page gets a one-time session token and the path of the WebSocket.

import { ERROR_CODES } from './protocol.js';

const ID = '([A-Za-z0-9][A-Za-z0-9_-]{7,63})';
const VIEWER = '([A-Za-z0-9_-]{1,64})';
const RATIOS = new Set(['4:3', '16:9', 'portrait']);

/**
 * `browser`: the service of server/browser-service.js (or null). Returns an async function (request, context) -> true when the request was one of these routes (answered), false when it is not;
 * the context is { url, authenticate(request) -> { id }, readJson(request, max, options), send(status, body), fail(code, message, extra) (throws) } from the request handler of app.js.
 */
export function createBrowserLiveRoutes({ browser, limiter = null, log = () => {} }) {
  const routes = [
    { method: 'POST', re: new RegExp(`^/v1/browser/${ID}/viewer$`), run: ({ user, match }) => browser.sessions.viewer(match[1], user.id).then((body) => [200, body]) },
    { method: 'DELETE', re: new RegExp(`^/v1/browser/${ID}/viewer/${VIEWER}$`), run: ({ user, match }) => browser.sessions.closeViewer(match[1], user.id, match[2]).then(() => [200, { ok: true }]) },
    {
      method: 'POST', re: new RegExp(`^/v1/browser/${ID}/control$`), body: 512,
      run: async ({ user, match, body, problem }) => {
        if (body?.mode !== 'user' && body?.mode !== 'model') problem('bad_request', 'mode must be user or model.');
        if (body.mode === 'user' && typeof body.viewerId !== 'string') problem('bad_request', 'viewerId is needed to give control to a person.');
        return [200, await browser.sessions.control(match[1], user.id, { mode: body.mode, viewerId: body.viewerId })];
      }
    },
    {
      method: 'POST', re: new RegExp(`^/v1/browser/${ID}/tabs$`), body: 4096,
      run: async ({ user, match, body, problem }) => {
        let result;
        try {
          result = await browser.sessions.tabAction(match[1], user.id, body || {});
        } catch (error) {
          if (error?.name === 'BrowserSessionError' && error.code === 'bad_request') problem('bad_request', error.message);
          throw error;
        }
        // What goes back is the plain facts of the tabs (never a picture or the text of a page).
        return [200, { ok: true, ...(Array.isArray(result?.tabs) ? { tabs: result.tabs.map((tab) => ({ tabId: String(tab.tabId), title: String(tab.title || '').slice(0, 200), url: String(tab.url || '').slice(0, 500), active: tab.active === true })) } : {}), ...(result?.tabId ? { tabId: String(result.tabId) } : {}), ...(typeof result?.url === 'string' ? { url: result.url.slice(0, 500) } : {}) }];
      }
    },
    {
      method: 'POST', re: new RegExp(`^/v1/browser/${ID}/screen$`), body: 256,
      run: async ({ user, match, body, problem }) => {
        if (!RATIOS.has(body?.ratio)) problem('bad_request', 'ratio must be 4:3, 16:9 or portrait.');
        return [200, await browser.sessions.screen(match[1], user.id, body.ratio)];
      }
    }
  ];
  return async function handle(request, { url, authenticate, readJson, send, fail }) {
    if (!browser) return false;
    const problem = (kind, message, extra) => fail({ bad_request: ERROR_CODES.badRequest, rate_limited: ERROR_CODES.rateLimited, not_found: ERROR_CODES.notFound, wrong_phase: ERROR_CODES.wrongPhase, runs_unavailable: ERROR_CODES.runsUnavailable }[kind], message, extra);
    const route = routes.find((r) => r.method === request.method && r.re.test(url.pathname));
    if (!route) return false;
    const user = await authenticate(request);
    // What is refused is said in the log (the kind of route and why, nothing of the person or the page), so a screen that does not come can be traced.
    const kind = url.pathname.split('/')[4] || '';
    if (limiter && !limiter.take?.(user.id)) { log('browser_live_refused', { route: kind, why: 'rate_limited' }); problem('rate_limited', 'Too many requests.'); }
    if (!(await browser.mayUse(user.id))) { log('browser_live_refused', { route: kind, why: 'not_allowed' }); problem('not_found', 'There is no such browser.'); }
    let body = null;
    if (route.body) body = await readJson(request, route.body, { optional: true });
    try {
      const [status, payload] = await route.run({ user, match: route.re.exec(url.pathname), body, problem });
      send(status, payload);
    } catch (error) {
      if (error?.name === 'BrowserSessionError' || error?.name === 'BrowserHostError') log('browser_live_refused', { route: kind, why: String(error.code || error.name).slice(0, 40), status: Number(error.status) || 0 });
      if (error?.name === 'BrowserSessionError' && error.code === 'not_found') problem('not_found', 'There is no such browser.');
      if (error?.name === 'BrowserHostError') {
        if (error.code === 'not_live' || error.code === 'not_ready' || error.status === 404 || error.status === 409) problem('wrong_phase', 'The live screen is not ready.', { reason: error.code });
        if (error.status === 429) problem('rate_limited', 'Too many people are looking at this browser.', { reason: error.code });
        problem('runs_unavailable', 'The live screen is not available right now.', { reason: error.code });
      }
      throw error;
    }
    return true;
  };
}
