import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config.js';
import { createLogger } from '../../server/log.js';
import { INVITE_MAIL_LIMIT, createProjectInvites, inviteMailFor } from '../../server/project-invites.js';

// An invitation to a shared project by mail: the database makes it, the server sends the mail (English, one button, nothing of the project), a person sends 20 an hour and sees how many are left,
// and a mail that could not be sent does not count and takes the invitation back.

const USER = '123e4567-e89b-12d3-a456-426614174000';
const PROJECT = '223e4567-e89b-12d3-a456-426614174001';
const TOKEN = 'good-token-good-token-good-token';

const setup = ({ send = async () => {}, rpc = null, now = () => 1000 } = {}) => {
  const sent = [];
  const calls = [];
  const db = { rpc: rpc || (async (name, params) => { calls.push([name, params]); return { id: 'i1', code: 'C'.repeat(40), email: params.p_email.toLowerCase(), role: params.p_role, project_name: 'City plan' }; }) };
  const mailer = { configured: true, send: async (mail) => { await send(mail); sent.push(mail); } };
  return { sent, calls, invites: createProjectInvites({ db, mailer, appUrl: 'https://noureon.com/', now }) };
};

test('the mail is English, names the person and the project, has one button and nothing else of the project', () => {
  const mail = inviteMailFor({ inviter: 'Ada <b>', project: 'City plan', role: 'editor', url: 'https://noureon.com/join/abc' });
  assert.equal(mail.subject, '[Noureon] Ada <b> invited you to a project');
  assert.match(mail.text, /Ada <b> invited you to the project "City plan" on Noureon, as an editor\./);
  assert.match(mail.text, /https:\/\/noureon\.com\/join\/abc/);
  assert.match(mail.html, /Open the invitation/);
  assert.match(mail.html, /Ada &lt;b&gt;/);
  assert.doesNotMatch(mail.html, /Ada <b>/);
  assert.match(inviteMailFor({ inviter: '', project: 'P', role: 'chat', url: 'https://noureon.com/join/x' }).subject, /You are invited/);
});

test('an invitation is made by the database for the address, then the mail goes out with the link of the invitation', async () => {
  const { sent, calls, invites } = setup();
  const result = await invites.send({ userId: USER, projectId: PROJECT, email: 'Bob@Example.test', role: 'chat', inviterName: 'Ada' });
  assert.deepEqual(calls[0], ['server_create_project_email_invite', { p_user_id: USER, p_project_id: PROJECT, p_email: 'Bob@Example.test', p_role: 'chat', p_inviter_name: 'Ada' }]);
  assert.equal(sent[0].to, 'bob@example.test');
  assert.match(sent[0].text, new RegExp(`https://noureon.com/join/${'C'.repeat(40)}`));
  assert.deepEqual(result, { id: 'i1', email: 'bob@example.test', role: 'chat', remaining: INVITE_MAIL_LIMIT - 1, limit: INVITE_MAIL_LIMIT });
});

test('a person sends 20 an hour; the hour is a sliding one and a mail that failed does not count', async () => {
  let time = 1000;
  let fail = false;
  const { invites, calls } = setup({ now: () => time, send: async () => { if (fail) throw new Error('down'); } });
  for (let index = 0; index < INVITE_MAIL_LIMIT; index += 1) await invites.send({ userId: USER, projectId: PROJECT, email: `a${index}@example.test`, role: 'chat' });
  assert.equal(invites.remaining(USER), 0);
  await assert.rejects(() => invites.send({ userId: USER, projectId: PROJECT, email: 'late@example.test', role: 'chat' }), (error) => error.code === 'rate_limited' && error.extra.remaining === 0);
  assert.equal(invites.remaining('someone-else'), INVITE_MAIL_LIMIT);
  time += 61 * 60 * 1000;
  assert.equal(invites.remaining(USER), INVITE_MAIL_LIMIT);
  fail = true;
  await assert.rejects(() => invites.send({ userId: USER, projectId: PROJECT, email: 'x@example.test', role: 'chat' }), (error) => error.code === 'mail');
  assert.equal(invites.remaining(USER), INVITE_MAIL_LIMIT);
  assert.equal(calls.at(-1)[0], 'server_revoke_project_invite');
});

test('what the database refuses is told, and does not count', async () => {
  for (const word of ['not_allowed', 'not_shared', 'invalid_email', 'invalid_role', 'invite_full']) {
    const { invites } = setup({ rpc: async () => { throw new Error(`P0001: ${word}`); } });
    await assert.rejects(() => invites.send({ userId: USER, projectId: PROJECT, email: 'a@example.test', role: 'chat' }), (error) => error.code === word);
    assert.equal(invites.remaining(USER), INVITE_MAIL_LIMIT);
  }
  const { invites } = setup({ rpc: async () => { throw new Error('boom'); } });
  await assert.rejects(() => invites.send({ userId: USER, projectId: PROJECT, email: 'a@example.test', role: 'chat' }), (error) => error.code === 'unavailable');
  const unconfigured = createProjectInvites({ db: {}, mailer: { configured: false } });
  await assert.rejects(() => unconfigured.send({ userId: USER, projectId: PROJECT, email: 'a@example.test', role: 'chat' }), (error) => error.code === 'unavailable');
});

async function withServer(run, { projectInvites }) {
  const config = loadConfig({ SUPABASE_URL: 'https://project.supabase.example', SUPABASE_ANON_KEY: 'anon', SOURCE_COMMIT: 'abc123' });
  const fetchImpl = async (url, options) => (options.headers.Authorization === `Bearer ${TOKEN}` ? new Response(JSON.stringify({ id: USER }), { status: 200 }) : new Response('{}', { status: 401 }));
  const server = createServer(createApp({ config, fetchImpl, projectInvites, log: createLogger(() => {}) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

test('POST /v1/projects/:id/invite-email sends the invitation and GET /v1/project-invite-quota says how many are left; the errors say why', async () => {
  const { invites, sent } = setup();
  await withServer(async (base) => {
    const quota = await (await fetch(`${base}/v1/project-invite-quota`, { headers })).json();
    assert.deepEqual(quota, { remaining: INVITE_MAIL_LIMIT, limit: INVITE_MAIL_LIMIT });
    const made = await fetch(`${base}/v1/projects/${PROJECT}/invite-email`, { method: 'POST', headers, body: JSON.stringify({ email: 'bob@example.test', role: 'editor', inviterName: 'Ada' }) });
    assert.equal(made.status, 201);
    assert.equal((await made.json()).invite.remaining, INVITE_MAIL_LIMIT - 1);
    assert.equal(sent.length, 1);
    assert.equal((await fetch(`${base}/v1/project-invite-quota`)).status, 401);
    assert.equal((await fetch(`${base}/v1/projects/${PROJECT}/invite-email`, { method: 'POST', body: '{}' })).status, 401);
  }, { projectInvites: invites });
  const limited = setup();
  await withServer(async (base) => {
    for (let index = 0; index < INVITE_MAIL_LIMIT; index += 1) await fetch(`${base}/v1/projects/${PROJECT}/invite-email`, { method: 'POST', headers, body: JSON.stringify({ email: `a${index}@example.test`, role: 'chat' }) });
    const over = await fetch(`${base}/v1/projects/${PROJECT}/invite-email`, { method: 'POST', headers, body: JSON.stringify({ email: 'z@example.test', role: 'chat' }) });
    assert.equal(over.status, 429);
    assert.equal((await over.json()).error.remaining, 0);
  }, { projectInvites: limited.invites });
  const refused = createProjectInvites({ db: { rpc: async () => { throw new Error('invalid_email'); } }, mailer: { configured: true, send: async () => {} } });
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/v1/projects/${PROJECT}/invite-email`, { method: 'POST', headers, body: JSON.stringify({ email: 'nope', role: 'chat' }) })).status, 400);
  }, { projectInvites: refused });
  await withServer(async (base) => { assert.equal((await fetch(`${base}/v1/project-invite-quota`, { headers })).status, 503); }, { projectInvites: null });
});
