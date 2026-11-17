// The routes of the person's own side of the browser agent (design doc §7, §9): whether they may use it and their invite codes, redeeming a code, their login state (look, log out of one site,
// delete it all), and for the people in charge: stopping every browser and making codes. Whoever is signed in may ask where they stand; the rest follows the rules named on each route.
//   GET    /v1/browser/access                     -> { allowed, admin, codes: [{ code, used }] }
//   POST   /v1/browser/redeem                     { code } -> { ok }
//   GET    /v1/browser/status                     -> { open, conversationId?, state?, idleMsLeft?, taskMsLeft?, closedReason? }   (the person's own browser, for the countdown of the tag)
//   GET    /v1/browser/profile                    -> { exists, sizeBytes?, updatedAt?, lastUsedAt?, sites: [] }   (sites to be logged out of at the next start)
//   POST   /v1/browser/profile/logout             { origin } -> { ok }   (the site is logged out when the next browser starts, or now when one is running)
//   DELETE /v1/browser/profile                    -> { ok }              (the whole login state; the vault stays)
//   POST   /v1/browser/admin/stop-all             -> { stopped }         (admins only)
//   POST   /v1/browser/admin/codes                { count } -> { codes } (admins only)
import { ERROR_CODES } from './protocol.js';
import { InviteError } from './browser-invites.js';
import { originOf } from './browser-logins.js';

const KIND = { bad_user: 'bad_request', invalid_code: 'bad_request', own_code: 'bad_request', already: 'wrong_phase' };

export function createBrowserAccountRoutes({ browser, limiter = null }) {
  const routes = [
    {
      method: 'GET', re: /^\/v1\/browser\/access$/,
      run: async ({ user }) => {
        const allowed = await browser.mayUse(user.id);
        const admin = allowed && await browser.isAdmin(user.id);
        return [200, { allowed, admin, codes: allowed ? await browser.invites.codesOf(user.id, { hasAccess: true }).catch(() => []) : [] }];
      }
    },
    {
      method: 'POST', re: /^\/v1\/browser\/redeem$/, body: 512,
      run: async ({ user, body }) => {
        await browser.invites.redeem(user.id, body?.code);
        browser.mayUse.forget?.(user.id);
        return [200, { ok: true }];
      }
    },
    {
      method: 'GET', re: /^\/v1\/browser\/status$/,
      run: async ({ user }) => [200, await browser.sessions.status(user.id)]
    },
    {
      method: 'GET', re: /^\/v1\/browser\/profile$/,
      run: async ({ user }) => {
        const facts = await browser.profiles.row(user.id);
        return [200, facts ? { exists: true, sizeBytes: Number(facts.size_bytes) || 0, updatedAt: facts.updated_at, lastUsedAt: facts.last_used_at, sites: Array.isArray(facts.pending_clear) ? facts.pending_clear : [] } : { exists: false, sites: [] }];
      }
    },
    {
      method: 'POST', re: /^\/v1\/browser\/profile\/logout$/, body: 512,
      run: async ({ user, body, problem }) => {
        const origin = originOf(body?.origin);
        if (!origin) problem('bad_request', 'Give the https address of the site.');
        await browser.profiles.addPendingClear(user.id, [new URL(origin).hostname]);
        // A logins of the site are not touched: only the login state of the browser goes.
        return [200, { ok: true }];
      }
    },
    { method: 'DELETE', re: /^\/v1\/browser\/profile$/, run: async ({ user }) => { await browser.profiles.remove(user.id); return [200, { ok: true }]; } },
    { method: 'POST', re: /^\/v1\/browser\/admin\/stop-all$/, admin: true, run: async () => [200, { stopped: await browser.sessions.stopAll() }] },
    { method: 'POST', re: /^\/v1\/browser\/admin\/codes$/, admin: true, body: 256, run: async ({ body }) => [200, { codes: await browser.invites.mintLoose(body?.count) }] }
  ];
  return async function handle(request, { url, authenticate, readJson, send, fail }) {
    if (!browser?.invites) return false;
    const route = routes.find((r) => r.method === request.method && r.re.test(url.pathname));
    if (!route) return false;
    const problem = (kind, message, extra) => fail({ bad_request: ERROR_CODES.badRequest, rate_limited: ERROR_CODES.rateLimited, not_found: ERROR_CODES.notFound, wrong_phase: ERROR_CODES.wrongPhase }[kind], message, extra);
    const user = await authenticate(request);
    if (limiter && !limiter.take?.(user.id)) problem('rate_limited', 'Too many requests.');
    // The people in charge only; for anyone else it is as if there were nothing here.
    if (route.admin && !(await browser.isAdmin(user.id))) problem('not_found', 'Not found.');
    const body = route.body ? await readJson(request, route.body, { optional: true }) : null;
    try {
      const [status, payload] = await route.run({ user, match: route.re.exec(url.pathname), body, problem });
      send(status, payload);
    } catch (error) {
      if (error instanceof InviteError) problem(KIND[error.code] || 'bad_request', error.message, { reason: error.code });
      throw error;
    }
    return true;
  };
}
