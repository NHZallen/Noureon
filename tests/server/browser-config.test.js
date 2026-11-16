import assert from 'node:assert/strict';
import test from 'node:test';

import { browserAllows, createBrowserAccess, createEmailLookup, readBrowserConfig } from '../../server/browser-config.js';

const SECRET = 'a'.repeat(40);
const UID = '11111111-1111-4111-8111-111111111111';
const base = { BROWSER_HOSTS: 'http://172.29.0.1:40010', BROWSER_HOST_SECRET: SECRET, BROWSER_ALLOWED: `Allen@Example.com, ${UID}` };

test('it is on only when the address, the secret and somebody on the list are all there; not set means nobody', () => {
  const problems = [];
  const config = readBrowserConfig(base, problems);
  assert.deepEqual(problems, []);
  assert.equal(config.enabled, true);
  assert.deepEqual(config.hosts, ['http://172.29.0.1:40010']);
  assert.equal(readBrowserConfig({ ...base, BROWSER_ALLOWED: '' }).enabled, false, 'no list: nobody');
  assert.equal(readBrowserConfig({ ...base, BROWSER_HOSTS: '' }).enabled, false);
  assert.equal(readBrowserConfig({ ...base, BROWSER_HOST_SECRET: '' }).enabled, false);
  assert.equal(readBrowserConfig({}).enabled, false);
  const off = readBrowserConfig({ ...base, BROWSER_ENABLED: 'false' });
  assert.equal(off.enabled, false);
  assert.equal(off.switchedOff, true);
});

test('what is wrong is said in a plain sentence, without the secret', () => {
  const problems = [];
  const config = readBrowserConfig({ BROWSER_HOSTS: 'not-a-url,ftp://x', BROWSER_HOST_SECRET: 'short-secret', BROWSER_ALLOWED: 'nobody', BROWSER_MAX_ACTIONS: '-3' }, problems);
  assert.equal(config.enabled, false);
  assert.equal(problems.length, 5);
  assert.ok(problems.every((line) => !line.includes('short-secret')));
});

test('the list works by account id and by email (any case); the number of actions is unlimited unless set', () => {
  const config = readBrowserConfig(base);
  assert.equal(browserAllows(config, { userId: UID.toUpperCase() }), true);
  assert.equal(browserAllows(config, { userId: 'x', email: 'ALLEN@example.com' }), true);
  assert.equal(browserAllows(config, { userId: 'x', email: 'other@example.com' }), false);
  assert.equal(browserAllows(config, {}), false);
  assert.equal(config.maxActions, 0);
  assert.equal(readBrowserConfig({ ...base, BROWSER_MAX_ACTIONS: '50' }).maxActions, 50);
});

test('the replies know only the account id: the email is looked up only when the list has an email, kept for a while, and a failure is "no"', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return url.includes('/user-a') ? new Response(JSON.stringify({ email: 'Allen@example.com' }), { status: 200 }) : new Response('{}', { status: 404 }); };
  let t = 0;
  const emailOf = createEmailLookup({ url: 'https://db.example', serviceKey: 'service', fetchImpl, now: () => t });
  const access = createBrowserAccess({ config: readBrowserConfig(base), emailOf });
  assert.equal(await access.call(null, 'user-a'), true);
  assert.equal(await access('user-a'), true);
  assert.equal(calls.length, 1, 'asked once, then kept');
  assert.equal(await access('user-b'), false);
  assert.equal(await access(UID), true);
  assert.equal(calls.length, 2, 'an account id on the list is never looked up');
  t += 6 * 60_000;
  await access('user-a');
  assert.equal(calls.length, 3, 'asked again after a few minutes');
  const idsOnly = createBrowserAccess({ config: readBrowserConfig({ ...base, BROWSER_ALLOWED: UID }), emailOf });
  assert.equal(await idsOnly('user-a'), false);
  assert.equal(calls.length, 3, 'no emails on the list: no lookup');
  const down = createBrowserAccess({ config: readBrowserConfig(base), emailOf: createEmailLookup({ url: 'https://db.example', serviceKey: 'service', fetchImpl: async () => { throw new Error('down'); } }) });
  assert.equal(await down('user-a'), false);
  assert.equal(await createBrowserAccess({ config: readBrowserConfig({}) })('anyone'), false);
});
