import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createLogger } from '../../server/log.js';
import { SECURITY_EVENTS, SECURITY_NOTICE_LIMIT, createSecurityNotices, securityNoticeMailFor } from '../../server/security-notices.js';

// The mail for a change that protects an account or the API keys: English, in the look of the other mails, to the address of the account only, at most 10 an hour.

const USER = '123e4567-e89b-12d3-a456-426614174000';
const TOKEN = 'good-token-good-token-good-token';
const TIME = Date.UTC(2026, 10, 12, 9, 5);

const setup = ({ send = async () => {}, now = () => TIME } = {}) => {
  const sent = [];
  const mailer = { configured: true, send: async (mail) => { await send(mail); sent.push(mail); } };
  return { sent, notices: createSecurityNotices({ mailer, appUrl: 'https://noureon.com/', now }) };
};

test('every event has a mail in English: what happened, when (UTC), what to do if it was not the person, one button, and nothing of the account', () => {
  for (const event of Object.keys(SECURITY_EVENTS)) {
    const mail = securityNoticeMailFor({ event, time: TIME });
    assert.match(mail.subject, /^\[Noureon\] /, event);
    assert.match(mail.text, /When: 2026-11-12 09:05 UTC/, event);
    assert.match(mail.text, /If it was not you/, event);
    assert.match(mail.html, /Open Noureon/, event);
    assert.match(mail.html, /href="https:\/\/noureon\.com"/, event);
    assert.doesNotMatch(mail.html + mail.text, /undefined|\[object/, event);
  }
  assert.throws(() => securityNoticeMailFor({ event: 'something-else', time: TIME }), (error) => error.code === 'invalid_event');
});

test('the mail goes to the address of the account, counts 10 an hour for each account, and a mail that failed does not count', async () => {
  let time = TIME;
  let fail = false;
  const { sent, notices } = setup({ now: () => time, send: async () => { if (fail) throw new Error('down'); } });
  assert.deepEqual(await notices.send({ userId: USER, email: 'me@example.test', event: 'passkey-added' }), { sent: true });
  assert.equal(sent[0].to, 'me@example.test');
  for (let index = 1; index < SECURITY_NOTICE_LIMIT; index += 1) await notices.send({ userId: USER, email: 'me@example.test', event: 'passkey-removed' });
  await assert.rejects(() => notices.send({ userId: USER, email: 'me@example.test', event: 'passkey-added' }), (error) => error.code === 'rate_limited');
  await notices.send({ userId: 'someone-else', email: 'x@example.test', event: 'passkey-added' });
  time += 61 * 60 * 1000;
  fail = true;
  await assert.rejects(() => notices.send({ userId: USER, email: 'me@example.test', event: 'passkey-added' }), (error) => error.code === 'mail');
  fail = false;
  for (let index = 0; index < SECURITY_NOTICE_LIMIT; index += 1) await notices.send({ userId: USER, email: 'me@example.test', event: 'passkey-added' });
  assert.deepEqual(await notices.send({ userId: 'no-address', email: '', event: 'passkey-added' }), { sent: false });
  await assert.rejects(() => notices.send({ userId: USER, email: 'me@example.test', event: 'nope' }), (error) => error.code === 'invalid_event');
  await assert.rejects(() => createSecurityNotices({ mailer: { configured: false } }).send({ userId: USER, email: 'me@example.test', event: 'passkey-added' }), (error) => error.code === 'unavailable');
});

async function withServer(run, { securityNotices, email = 'Me@Example.test' }) {
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => (options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: USER, email }), { status: 200 }) : new Response('{}', { status: 401 }));
  const server = createServer(createApp({ config, fetchImpl, securityNotices, log: createLogger(() => {}) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };
const post = (base, body, withHeaders = headers) => fetch(`${base}/v1/security-notice`, { method: 'POST', headers: withHeaders, body: JSON.stringify(body) });

test('POST /v1/security-notice mails the address of the sign-in (never one in the request), needs the sign-in, and says why it refuses', async () => {
  const { sent, notices } = setup();
  await withServer(async (base) => {
    const done = await post(base, { event: 'sync-password-cleared', to: 'attacker@example.test', email: 'attacker@example.test' });
    assert.equal(done.status, 202);
    assert.deepEqual(await done.json(), { sent: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'me@example.test');
    assert.equal((await post(base, { event: 'sync-password-cleared' }, { 'Content-Type': 'application/json' })).status, 401);
    assert.equal((await post(base, { event: 'not-an-event' })).status, 400);
  }, { securityNotices: notices });
  const limited = setup();
  await withServer(async (base) => {
    for (let index = 0; index < SECURITY_NOTICE_LIMIT; index += 1) await post(base, { event: 'passkey-added' });
    assert.equal((await post(base, { event: 'passkey-added' })).status, 429);
  }, { securityNotices: limited.notices });
  await withServer(async (base) => { assert.equal((await post(base, { event: 'passkey-added' })).status, 503); }, { securityNotices: null });
});
