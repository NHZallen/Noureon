// neko's REST interface as browser-host uses it (browser-host/neko-api.mjs), with a fake fetch: what is sent, and how errors come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNekoApi, NekoError } from '../browser-host/neko-api.mjs';

const make = (handler) => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body ? JSON.parse(options.body) : undefined });
    const out = handler(url, options) ?? { status: 204, body: '' };
    return { ok: out.status >= 200 && out.status < 300, status: out.status, text: async () => out.body };
  };
  return { calls, api: createNekoApi({ baseUrl: 'http://172.29.0.2:8080', apiToken: 'T'.repeat(32), fetchImpl, timeoutMs: 200 }) };
};

test('a member is made with the api token as a bearer, may watch and (when given control) point and type, and may not share media', async () => {
  const { api, calls } = make(() => ({ status: 200, body: '{"id":"v-1"}' }));
  await api.createMember({ username: 'v-aaaa1111', password: 'p'.repeat(32) });
  assert.equal(calls[0].url, 'http://172.29.0.2:8080/api/members');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.authorization, `Bearer ${'T'.repeat(32)}`);
  assert.equal(calls[0].body.username, 'v-aaaa1111');
  const profile = calls[0].body.profile;
  assert.equal(profile.is_admin, false);
  assert.equal(profile.can_host, true);
  assert.equal(profile.can_share_media, false);
});

test('the login sends no api token and returns only the session token', async () => {
  const { api, calls } = make(() => ({ status: 200, body: '{"id":"v-1","token":"S","profile":{}}' }));
  assert.deepEqual(await api.login('v-aaaa1111', 'p'.repeat(32)), { id: 'v-1', token: 'S' });
  assert.equal(calls[0].headers.authorization, undefined);
});

test('control is given to a member, taken back, the screen is set and the controls locked, all with the api token', async () => {
  const { api, calls } = make(() => ({ status: 204, body: '' }));
  await api.give('v-aaaa1111');
  await api.reset();
  await api.setScreen({ width: 1280, height: 720 });
  await api.settings({ locked_controls: true });
  await api.deleteMember('v-aaaa1111');
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace('http://172.29.0.2:8080/api', '')}`), [
    'POST /room/control/give/v-aaaa1111', 'POST /room/control/reset', 'POST /room/screen', 'POST /room/settings', 'DELETE /members/v-aaaa1111'
  ]);
  assert.deepEqual(calls[2].body, { width: 1280, height: 720, rate: 20 });
  assert.ok(calls.every((c) => c.headers.authorization === `Bearer ${'T'.repeat(32)}`));
});

test('an id that could change the path is refused before anything is sent', async () => {
  const { api, calls } = make(() => ({ status: 204 }));
  await assert.rejects(() => api.deleteMember('../settings'), /bad id/);
  await assert.rejects(() => api.give('a/b'), /bad id/);
  await assert.rejects(() => api.createMember({ username: 'a b', password: 'p'.repeat(32) }), /bad username/);
  await assert.rejects(() => api.createMember({ username: 'v-aaaa1111', password: 'short' }), /bad password/);
  assert.equal(calls.length, 0);
});

test('errors come back as NekoError with neko\'s own words trimmed; no answer in time and no connection are told apart from a refusal', async () => {
  const refused = make(() => ({ status: 401, body: '{"code":401,"message":"Unauthorized"}' }));
  await assert.rejects(() => refused.api.reset(), (error) => error instanceof NekoError && error.status === 401 && error.message === 'Unauthorized');
  const slow = createNekoApi({ baseUrl: 'http://172.29.0.2:8080', apiToken: 'T'.repeat(32), timeoutMs: 20, fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })))) });
  await assert.rejects(() => slow.reset(), (error) => error.status === 0 && /in time/.test(error.message));
  const down = createNekoApi({ baseUrl: 'http://172.29.0.2:8080', apiToken: 'T'.repeat(32), fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(() => down.reset(), (error) => error.status === 0 && /could not be reached/.test(error.message));
  assert.throws(() => createNekoApi({ baseUrl: 'https://example.com', apiToken: 'x' }), /bad neko address/);
});
