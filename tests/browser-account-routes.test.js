// The person's own side of the browser agent (server/browser-account-routes.js): where they stand, redeeming a code, the login state, and what only the people in charge may do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAccountRoutes } from '../server/browser-account-routes.js';
import { InviteError } from '../server/browser-invites.js';

const A = '11111111-1111-4111-8111-111111111111';
const ADMIN = '99999999-9999-4999-8999-999999999999';

function setup() {
  const calls = [];
  const access = new Set([A, ADMIN]);
  const browser = {
    mayUse: Object.assign(async (id) => access.has(id), { forget: (id) => calls.push(['forget', id]) }),
    isAdmin: async (id) => id === ADMIN,
    invites: {
      codesOf: async (id, o) => { calls.push(['codesOf', id, o]); return [{ code: 'NRN-AAAA-BBBB', used: false }]; },
      redeem: async (id, code) => { calls.push(['redeem', id, code]); if (code === 'bad') throw new InviteError('invalid_code', 'That code cannot be used.'); if (code === 'have') throw new InviteError('already', 'You already have access.'); access.add(id); return { ok: true }; },
      mintLoose: async (n) => { calls.push(['mint', n]); return ['NRN-CCCC-DDDD']; }
    },
    profiles: {
      row: async (id) => (id === A ? { size_bytes: 1234, updated_at: 'u', last_used_at: 'l', pending_clear: ['shop.example'] } : null),
      addPendingClear: async (id, sites) => { calls.push(['clear', id, sites]); return true; },
      remove: async (id) => { calls.push(['remove', id]); }
    },
    sessions: { stopAll: async () => { calls.push(['stopAll']); return 3; } }
  };
  const handle = createBrowserAccountRoutes({ browser });
  const run = async (method, path, body, user = { id: A }) => {
    const out = {};
    const ctx = { url: new URL(path, 'http://l'), authenticate: async () => user, readJson: async () => body ?? {}, send: (status, payload) => { out.sent = { status, payload }; }, fail: (code, message, extra) => { const e = new Error(message); e.code = code; e.extra = extra; throw e; } };
    try { out.handled = await handle({ method }, ctx); } catch (error) { out.failed = error; }
    return out;
  };
  return { run, calls, access };
}

test('where a person stands: allowed with their codes, or not allowed with nothing', async () => {
  const t = setup();
  assert.deepEqual((await t.run('GET', '/v1/browser/access')).sent.payload, { allowed: true, admin: false, codes: [{ code: 'NRN-AAAA-BBBB', used: false }] });
  const stranger = await t.run('GET', '/v1/browser/access', null, { id: 'stranger-id' });
  assert.deepEqual(stranger.sent.payload, { allowed: false, admin: false, codes: [] });
  assert.equal((await t.run('GET', '/v1/browser/access', null, { id: ADMIN })).sent.payload.admin, true);
});

test('redeeming a code lets the person in at once; a wrong code is a plain error', async () => {
  const t = setup();
  const done = await t.run('POST', '/v1/browser/redeem', { code: 'NRN-AAAA-BBBB' }, { id: 'newcomer' });
  assert.equal(done.sent.payload.ok, true);
  assert.deepEqual(t.calls.find((c) => c[0] === 'forget'), ['forget', 'newcomer']);
  assert.equal((await t.run('POST', '/v1/browser/redeem', { code: 'bad' }, { id: 'x' })).failed.code, 'bad_request');
  assert.equal((await t.run('POST', '/v1/browser/redeem', { code: 'have' }, { id: 'x' })).failed.code, 'wrong_phase');
});

test('the login state: look, log out of one site (only an https site), delete it all', async () => {
  const t = setup();
  assert.deepEqual((await t.run('GET', '/v1/browser/profile')).sent.payload, { exists: true, sizeBytes: 1234, updatedAt: 'u', lastUsedAt: 'l', sites: ['shop.example'] });
  assert.deepEqual((await t.run('GET', '/v1/browser/profile', null, { id: ADMIN })).sent.payload, { exists: false, sites: [] });
  assert.equal((await t.run('POST', '/v1/browser/profile/logout', { origin: 'https://shop.example/cart' })).sent.payload.ok, true);
  assert.deepEqual(t.calls.find((c) => c[0] === 'clear'), ['clear', A, ['shop.example']]);
  assert.equal((await t.run('POST', '/v1/browser/profile/logout', { origin: 'http://shop.example' })).failed.code, 'bad_request');
  assert.equal((await t.run('DELETE', '/v1/browser/profile')).sent.payload.ok, true);
  assert.deepEqual(t.calls.find((c) => c[0] === 'remove'), ['remove', A]);
});

test('stopping every browser and making codes are for the people in charge; for anyone else there is nothing there', async () => {
  const t = setup();
  assert.equal((await t.run('POST', '/v1/browser/admin/stop-all')).failed.code, 'not_found');
  assert.equal((await t.run('POST', '/v1/browser/admin/codes', { count: 2 })).failed.code, 'not_found');
  assert.equal((await t.run('POST', '/v1/browser/admin/stop-all', null, { id: ADMIN })).sent.payload.stopped, 3);
  assert.deepEqual((await t.run('POST', '/v1/browser/admin/codes', { count: 2 }, { id: ADMIN })).sent.payload.codes, ['NRN-CCCC-DDDD']);
  assert.equal((await t.run('GET', '/v1/browser/other')).handled, false);
  assert.equal(await createBrowserAccountRoutes({ browser: null })({ method: 'GET' }, { url: new URL('/v1/browser/access', 'http://l') }), false);
});
