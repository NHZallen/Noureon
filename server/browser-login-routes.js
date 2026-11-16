// The routes of the password vault of the browser agent (design doc §7): the settings page lists, adds, deletes and (after the person was confirmed again) shows logins.
//   GET    /v1/browser/logins                  -> { logins: [{ id, name, origins, createdAt, lastUsedAt }] }   (never a value)
//   POST   /v1/browser/logins                  { name, origins: ['https://…'], username, password } -> 201 { login }
//   DELETE /v1/browser/logins/:id              -> { ok }
//   POST   /v1/browser/logins/:id/reveal       -> { username, password }   (the page asks only after the three-step confirmation; the answer is never kept in a log)
// Only the person who owns a login reaches it, and only a person who may use the browser agent.
import { ERROR_CODES } from './protocol.js';
import { LoginError } from './browser-logins.js';

const UUID = '([0-9a-f-]{36})';
const KIND = { bad_user: 'bad_request', bad_id: 'bad_request', bad_name: 'bad_request', bad_origins: 'bad_request', bad_username: 'bad_request', bad_password: 'bad_request', too_many: 'wrong_phase', not_found: 'not_found', unreadable: 'wrong_phase' };

export function createBrowserLoginRoutes({ browser, limiter = null }) {
  const routes = [
    { method: 'GET', re: /^\/v1\/browser\/logins$/, run: async ({ user }) => [200, { logins: await browser.logins.list(user.id) }] },
    { method: 'POST', re: /^\/v1\/browser\/logins$/, body: 8 * 1024, run: async ({ user, body }) => [201, { login: await browser.logins.add(user.id, { name: body?.name, origins: body?.origins, username: body?.username, password: body?.password }) }] },
    { method: 'DELETE', re: new RegExp(`^/v1/browser/logins/${UUID}$`), run: async ({ user, match }) => { await browser.logins.remove(user.id, match[1]); return [200, { ok: true }]; } },
    { method: 'POST', re: new RegExp(`^/v1/browser/logins/${UUID}/reveal$`), run: async ({ user, match }) => [200, await browser.logins.reveal(user.id, match[1])] }
  ];
  return async function handle(request, { url, authenticate, readJson, send, fail }) {
    if (!browser?.logins) return false;
    const route = routes.find((r) => r.method === request.method && r.re.test(url.pathname));
    if (!route) return false;
    const problem = (kind, message, extra) => fail({ bad_request: ERROR_CODES.badRequest, rate_limited: ERROR_CODES.rateLimited, not_found: ERROR_CODES.notFound, wrong_phase: ERROR_CODES.wrongPhase }[kind], message, extra);
    const user = await authenticate(request);
    if (limiter && !limiter.take?.(user.id)) problem('rate_limited', 'Too many requests.');
    if (!(await browser.mayUse(user.id))) problem('not_found', 'There is no such browser.');
    const body = route.body ? await readJson(request, route.body) : null;
    try {
      const [status, payload] = await route.run({ user, match: route.re.exec(url.pathname), body });
      send(status, payload);
    } catch (error) {
      if (error instanceof LoginError) problem(KIND[error.code] || 'bad_request', error.message, { reason: error.code });
      throw error;
    }
    return true;
  };
}
