import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { createConnectorService, effectiveState } from '../../server/mcp/connections.js';
import { createKeyVault } from '../../server/key-vault.js';
import { createApi, ToolFailure } from '../../server/mcp/native/api.js';
import { PROVIDERS, createNativeClient, nativeToolNames } from '../../server/mcp/native/index.js';
import { documentText } from '../../server/mcp/native/google/docs.js';
import { explain } from '../../server/mcp/native/google/index.js';
import { CONNECTORS, connectorProblems, defaultLoginMode, getConnector, loginScopes, toolKind } from '../../src/data/connector-catalog.js';

const USER = '123e4567-e89b-12d3-a456-426614174000';
const REDIRECT = 'https://api.noureon.com/mcp/callback';
const google = getConnector('google');
const tool = (name) => PROVIDERS.google.tools.find((item) => item.name === name);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A `call` that records what the tool asks of Google and answers with what the test gives. */
function recorder(answer = {}) {
  const calls = [];
  const call = async (method, url, options = {}) => {
    calls.push({ method, url, ...options });
    const given = typeof answer === 'function' ? answer(method, url, options) : answer;
    return given;
  };
  return { call, calls };
}

test('the catalog entry is right, and every tool the provider has is known to read or to write (and no tool is listed that it does not have)', () => {
  assert.deepEqual(connectorProblems(google), []);
  const names = nativeToolNames('google');
  assert.equal(new Set(names).size, names.length, 'no name twice');
  assert.ok(names.every((name) => /^[a-z][a-z0-9_]{1,63}$/.test(name)));
  for (const name of names) assert.ok(google.reads.includes(name) !== google.writes.includes(name), `${name} is in exactly one list`);
  assert.deepEqual([...google.reads, ...google.writes].filter((name) => !names.includes(name)), []);
  assert.equal(toolKind(google, 'gmail_send_message'), 'write');
  assert.equal(toolKind(google, 'drive_read_file'), 'read');
  assert.equal(defaultLoginMode(google), 'readonly', 'the login a person is offered first is the read-only one');
  assert.equal(defaultLoginMode(getConnector('linear')), 'readwrite');
  // Every scope is one Google has, written as Google writes them; the read-only login has no way to write.
  for (const scope of [...loginScopes(google, 'readonly'), ...loginScopes(google, 'readwrite')]) assert.match(scope, /^https:\/\/www\.googleapis\.com\/auth\/[a-z.]+$/);
  assert.ok(loginScopes(google, 'readonly').every((scope) => scope.endsWith('.readonly')));
  assert.ok(CONNECTORS.indexOf(google) === 0);
});

function setup(fetchImpl) {
  const rows = [];
  const matches = (filters) => (row) => Object.entries(filters || {}).every(([column, condition]) => {
    const [op, ...rest] = String(condition).split('.');
    return op === 'eq' ? String(row[column]) === rest.join('.') : true;
  });
  const db = {
    rows,
    select: async (table, { filters, limit } = {}) => rows.filter((row) => row.__table === table).filter(matches(filters)).slice(0, limit || 1000).map(({ __table, ...row }) => ({ ...row })),
    upsert: async (table, row, { onConflict }) => {
      const keys = onConflict.split(',');
      const at = rows.findIndex((entry) => entry.__table === table && keys.every((key) => entry[key] === row[key]));
      if (at >= 0) rows[at] = { ...rows[at], ...row };
      else rows.push({ __table: table, created_at: new Date().toISOString(), ...row });
    },
    remove: async (table, filters) => {
      for (let index = rows.length - 1; index >= 0; index -= 1) if (rows[index].__table === table && matches(filters)(rows[index])) rows.splice(index, 1);
    }
  };
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const service = createConnectorService({ db, vault, fetchImpl, config: { redirectUri: REDIRECT, cimdUrl: '', preregistered: { google: { clientId: 'the-id.apps.googleusercontent.com', clientSecret: 'GOCSPX-secret' } } } });
  return { db, service };
}

function fakeGoogle() {
  const state = { requests: [], tokens: [], accessLife: 3600, rejectFirst: false, failWith: null };
  let issued = 0;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target === 'https://oauth2.googleapis.com/token') {
      const form = Object.fromEntries(new URLSearchParams(String(options.body)));
      state.tokens.push({ ...form, authorization: options.headers?.authorization });
      issued += 1;
      return json({ access_token: `AT${issued}`, ...(form.grant_type === 'authorization_code' ? { refresh_token: 'RT1' } : {}), expires_in: state.accessLife, token_type: 'Bearer', scope: 'a b' });
    }
    state.requests.push({ method: options.method, url: target, authorization: options.headers?.authorization, body: options.body });
    if (state.failWith) return json(state.failWith.body, state.failWith.status);
    if (state.rejectFirst && state.requests.length === 1) return new Response('', { status: 401 });
    if (target.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) return json({ timeZone: 'Asia/Taipei', items: [{ id: 'e1', summary: 'Standup', start: { dateTime: '2026-03-02T09:00:00+08:00' }, end: { dateTime: '2026-03-02T09:15:00+08:00' }, htmlLink: 'https://calendar.google.com/e1' }] });
    return json({});
  };
  return { fetchImpl, state };
}

async function connect(service, mode) {
  const { url } = await service.startLogin(USER, 'google', mode);
  const target = new URL(url);
  const result = await service.completeLogin({ state: target.searchParams.get('state'), code: 'the-code' });
  return { target, result };
}

test('the login goes to Google with the read-only scopes first, asks for a refresh token, names no resource, and the secret goes in the body', async () => {
  const world = fakeGoogle();
  const { db, service } = setup(world.fetchImpl);
  const { target, result } = await connect(service, 'readonly');
  assert.equal(target.origin + target.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(target.searchParams.get('client_id'), 'the-id.apps.googleusercontent.com');
  assert.equal(target.searchParams.get('access_type'), 'offline');
  assert.equal(target.searchParams.get('prompt'), 'consent');
  assert.equal(target.searchParams.get('resource'), null, 'Google is not an MCP server: no resource');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(target.searchParams.get('scope'), loginScopes(google, 'readonly').join(' '));
  assert.deepEqual(result, { ok: true, connectorId: 'google' });
  const exchange = world.state.tokens[0];
  assert.equal(exchange.grant_type, 'authorization_code');
  assert.equal(exchange.client_secret, 'GOCSPX-secret');
  assert.equal(exchange.authorization, undefined, 'the secret is in the body, not in a header');
  assert.equal(exchange.resource, undefined);
  const row = db.rows.find((entry) => entry.__table === 'user_mcp_connections');
  assert.equal(row.status, 'connected');
  assert.equal(row.mode, 'readonly');
  assert.ok(!JSON.stringify(row).includes('AT1') && !JSON.stringify(row).includes('RT1'));
  assert.equal(row.tools.length, nativeToolNames('google').length, 'the tools are ours: nothing was asked of Google to list them');
  assert.equal(world.state.requests.length, 0);
});

test('a read-only login has its tools that change things off, a login that reads and writes has them ask, and a change in our own tool text switches nothing off', async () => {
  const world = fakeGoogle();
  const { db, service } = setup(world.fetchImpl);
  await connect(service, 'readonly');
  let [summary] = (await service.list(USER)).filter((entry) => entry.id === 'google');
  const states = Object.fromEntries(summary.tools.map((item) => [item.name, item.state]));
  assert.equal(states.calendar_list_events, 'allow');
  assert.equal(states.gmail_send_message, 'deny', 'read-only: cannot send');
  assert.equal(states.drive_trash_file, 'deny');
  await connect(service, 'readwrite');
  [summary] = (await service.list(USER)).filter((entry) => entry.id === 'google');
  assert.equal(Object.fromEntries(summary.tools.map((item) => [item.name, item.state])).gmail_send_message, 'ask');
  // The text of a tool changes in a later version of our code: the person does not have to switch it on again.
  const row = db.rows.find((entry) => entry.__table === 'user_mcp_connections');
  row.tools = row.tools.map((item) => ({ ...item, hash: 'old', description: 'older text' }));
  await service.refreshTools(USER, 'google');
  assert.deepEqual(db.rows.find((entry) => entry.__table === 'user_mcp_connections').changed, []);
  assert.equal(effectiveState(google, { mode: 'readonly', changed: [], permissions: {} }, 'sheets_update_values'), 'deny');
  assert.equal(effectiveState(getConnector('linear'), { mode: 'readonly', changed: [], permissions: {} }, 'create_issue'), 'ask', 'an MCP connector is left to its service');
});

test('a call goes to Google with the token, a token that Google refuses is renewed once, and Google\'s refusals come back as the result of the tool', async () => {
  const world = fakeGoogle();
  const { service } = setup(world.fetchImpl);
  await connect(service, 'readwrite');
  const client = service.clientFor(USER, 'google');
  world.state.rejectFirst = true;
  const found = await client.callTool('calendar_list_events', { time_min: '2026-03-02T00:00:00+08:00', max_results: 5 });
  assert.equal(found.isError, false);
  assert.equal(JSON.parse(found.text).events[0].summary, 'Standup');
  assert.equal(world.state.requests.length, 2, 'asked again with the new token');
  assert.equal(world.state.requests[0].authorization, 'Bearer AT1');
  assert.equal(world.state.requests[1].authorization, 'Bearer AT2');
  assert.equal(world.state.tokens.at(-1).grant_type, 'refresh_token');
  const asked = new URL(world.state.requests[1].url);
  assert.equal(asked.searchParams.get('singleEvents'), 'true');
  assert.equal(asked.searchParams.get('maxResults'), '5');
  // A refusal for lack of the permission says what to do about it.
  world.state.failWith = { status: 403, body: { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED', details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } } };
  const refused = await client.callTool('calendar_delete_event', { event_id: 'e1' });
  assert.equal(refused.isError, true);
  assert.match(refused.text, /read-only login/);
  assert.equal((await client.callTool('no_such_tool', {})).isError, true);
});

test('what is asked of a tool is checked before anything goes to Google', async () => {
  const world = fakeGoogle();
  const { service } = setup(world.fetchImpl);
  await connect(service, 'readwrite');
  const client = service.clientFor(USER, 'google');
  for (const [name, args] of [
    ['calendar_create_event', { summary: 'x', start: '2026-03-02T09:00:00', end: '2026-03-02T10:00:00' }],
    ['calendar_create_event', { summary: 'x', start: 'tomorrow', end: 'later' }],
    ['sheets_update_values', { spreadsheet_id: 's', range: 'A1', values: 'not rows' }],
    ['gmail_send_message', { to: ['not an address'], body: 'hi' }],
    ['gmail_send_message', { to: ['ana@example.com'], subject: 'a\r\nBcc: x@example.com', body: 'hi' }],
    ['drive_share_file', { file_id: 'f', email: 'ana@example.com', role: 'owner' }],
    ['docs_get_document', {}],
    ['drive_read_file', { file_id: 'a\nb' }]
  ]) {
    const answer = await client.callTool(name, args);
    assert.equal(answer.isError, true, `${name} ${JSON.stringify(args)}`);
  }
  assert.equal(world.state.requests.length, 0, 'nothing reached Google');
});

test('the token goes only to Google\'s own hosts, over https', async () => {
  const seen = [];
  const call = createApi({ hosts: PROVIDERS.google.hosts, getToken: async () => 'TOKEN', fetchImpl: async (url) => { seen.push(url); return json({}); } });
  await assert.rejects(call('GET', 'https://evil.example.com/steal'), ToolFailure);
  await assert.rejects(call('GET', 'http://www.googleapis.com/drive/v3/files'), ToolFailure);
  await assert.rejects(call('GET', 'https://www.googleapis.com.evil.example/x'), ToolFailure);
  assert.deepEqual(seen, []);
  await call('GET', 'https://www.googleapis.com/drive/v3/files', { query: { fields: 'a', ids: ['1', '2'], empty: '' } });
  assert.equal(seen[0], 'https://www.googleapis.com/drive/v3/files?fields=a&ids=1&ids=2');
});

test('Google\'s own errors are put in plain words', () => {
  const body = (error) => JSON.stringify({ error });
  assert.match(explain(403, body({ message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED' })), /read-only login/);
  assert.match(explain(403, body({ message: 'Google Sheets API has not been used in project 1 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }] })), /not turned on/);
  assert.match(explain(429, body({ message: 'Quota' })), /too many requests/);
  assert.match(explain(404, body({ message: 'File not found: x.' })), /Not found: File not found/);
  assert.equal(explain(500, 'not json'), 'Google answered 500.');
});

test('the tools ask Google what the documentation says: calendars, sheets, docs, slides, drive and mail', async () => {
  const run = async (name, args, answer) => {
    const { call, calls } = recorder(answer);
    const result = await tool(name).run(args, call);
    return { result, calls };
  };
  // Calendar: an all-day event is a date, a time without an offset needs the zone, guests are not told by default.
  let { calls } = await run('calendar_create_event', { summary: 'Trip', start: '2026-03-02', end: '2026-03-03', attendees: ['ana@example.com'] }, { id: 'e', start: { date: '2026-03-02' }, end: { date: '2026-03-03' } });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, 'https://www.googleapis.com/calendar/v3/calendars/primary/events');
  assert.deepEqual(calls[0].json, { summary: 'Trip', start: { date: '2026-03-02' }, end: { date: '2026-03-03' }, attendees: [{ email: 'ana@example.com' }] });
  assert.equal(calls[0].query.sendUpdates, 'none');
  ({ calls } = await run('calendar_update_event', { calendar_id: 'a@group.calendar.google.com', event_id: 'e/1', start: '2026-03-02T09:00:00', end: '2026-03-02T10:00:00', time_zone: 'Asia/Taipei' }, { id: 'e' }));
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].url, 'https://www.googleapis.com/calendar/v3/calendars/a%40group.calendar.google.com/events/e%2F1');
  assert.deepEqual(calls[0].json.start, { dateTime: '2026-03-02T09:00:00', timeZone: 'Asia/Taipei' });
  // Sheets: the range is one part of the address; USER_ENTERED unless raw.
  ({ calls } = await run('sheets_append_values', { spreadsheet_id: 'S', range: "Sheet 1!A:B", values: [['a', 1], ['=SUM(B1:B1)', null]] }, { updates: { updatedRange: 'Sheet 1!A2:B3', updatedRows: 2 } }));
  assert.equal(calls[0].url, 'https://sheets.googleapis.com/v4/spreadsheets/S/values/Sheet%201!A%3AB:append');
  assert.deepEqual(calls[0].query, { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' });
  assert.deepEqual(calls[0].json.values, [['a', 1], ['=SUM(B1:B1)', null]]);
  // Docs: a new document gets its text in a second call; adding at the end names no index.
  ({ calls } = await run('docs_create_document', { title: 'Notes', text: 'Hello' }, { documentId: 'D', title: 'Notes' }));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].json.requests, [{ insertText: { location: { index: 1 }, text: 'Hello' } }]);
  ({ calls } = await run('docs_append_text', { document_id: 'D', text: '\nMore' }, {}));
  assert.deepEqual(calls[0].json.requests[0].insertText.endOfSegmentLocation, {});
  // Slides: the new slide has its title and body put in the placeholders that were named for it.
  ({ calls } = await run('slides_add_slide', { presentation_id: 'P', title: 'Plan', body: 'One\nTwo' }, {}));
  const requests = calls[0].json.requests;
  assert.equal(requests[0].createSlide.slideLayoutReference.predefinedLayout, 'TITLE_AND_BODY');
  const [titleMap, bodyMap] = requests[0].createSlide.placeholderIdMappings;
  assert.deepEqual([requests[1].insertText.objectId, requests[1].insertText.text], [titleMap.objectId, 'Plan']);
  assert.deepEqual([requests[2].insertText.objectId, requests[2].insertText.text], [bodyMap.objectId, 'One\nTwo']);
  // Drive: the words searched are quoted, the bin is left out; a text file goes up in one multipart request.
  ({ calls } = await run('drive_search_files', { text: "Ana's \\ plan", query: "mimeType = 'application/pdf'" }, { files: [{ id: 'f', name: 'n', mimeType: 'application/pdf' }] }));
  assert.equal(calls[0].query.q, "trashed = false and fullText contains 'Ana\\'s \\\\ plan' and (mimeType = 'application/pdf')");
  ({ calls } = await run('drive_create_text_file', { name: 'a.md', text: '# Hi', mime_type: 'text/markdown', parent_id: 'F' }, { id: 'n', name: 'a.md', mimeType: 'text/markdown' }));
  assert.equal(calls[0].url, 'https://www.googleapis.com/upload/drive/v3/files');
  assert.match(calls[0].headers['content-type'], /^multipart\/related; boundary=noureon/);
  assert.match(calls[0].body, /"parents":\["F"\]/);
  assert.match(calls[0].body, /# Hi/);
  // A Google Doc is read as exported text; a picture is not read at all.
  ({ calls } = await run('drive_read_file', { file_id: 'D' }, (method, url) => (url.endsWith('/export') ? 'the words' : { id: 'D', name: 'Doc', mimeType: 'application/vnd.google-apps.document' })));
  assert.deepEqual(calls[1].query, { mimeType: 'text/plain' });
  await assert.rejects(tool('drive_read_file').run({ file_id: 'I' }, recorder({ id: 'I', name: 'p', mimeType: 'image/png' }).call), /cannot be read as text/);
});

test('a mail is written as Google takes it: other alphabets encoded, a reply in the conversation of the mail it answers, and nothing in a header from the text of the mail', async () => {
  const decode = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const original = { id: 'm1', threadId: 'T1', payload: { headers: [{ name: 'Message-ID', value: '<a@mail>' }, { name: 'Subject', value: '午餐' }, { name: 'From', value: 'Ana <ana@example.com>' }, { name: 'References', value: '<z@mail>' }] } };
  const { call, calls } = recorder((method, url) => (method === 'GET' ? original : { id: 'sent', threadId: 'T1' }));
  await tool('gmail_send_message').run({ reply_to_message_id: 'm1', body: '好的，明天見' }, call);
  const sent = calls.at(-1);
  assert.equal(sent.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(sent.json.threadId, 'T1');
  const lines = decode(sent.json.raw).split('\r\n');
  assert.ok(lines.includes('To: ana@example.com'));
  assert.ok(lines.includes(`Subject: =?UTF-8?B?${Buffer.from('Re: 午餐').toString('base64')}?=`));
  assert.ok(lines.includes('In-Reply-To: <a@mail>'));
  assert.ok(lines.includes('References: <z@mail> <a@mail>'));
  const body = Buffer.from(lines.slice(lines.indexOf('') + 1).join(''), 'base64').toString('utf8');
  assert.equal(body, '好的，明天見');
  // A draft is kept, not sent.
  const drafted = recorder({ id: 'd1', message: { id: 'm2' } });
  assert.deepEqual(await tool('gmail_create_draft').run({ to: ['ana@example.com'], subject: 'Hi', body: 'x' }, drafted.call), { draft_id: 'd1', message_id: 'm2', saved: true });
  assert.equal(drafted.calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts');
});

test('a message is read as its text (the plain part, or the page part without its markup), with the names of the files it carries', async () => {
  const data = (text) => Buffer.from(text, 'utf8').toString('base64url');
  const message = { id: 'm', threadId: 't', snippet: 's', labelIds: ['INBOX', 'UNREAD'], payload: { headers: [{ name: 'From', value: 'a@x.com' }, { name: 'Subject', value: 'Hi' }], mimeType: 'multipart/mixed', parts: [{ mimeType: 'text/html', body: { data: data('<style>p{}</style><p>Hello&nbsp;<b>you</b></p><p>Bye</p>') } }, { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'x', size: 10 } }] } };
  const { call } = recorder(message);
  const read = JSON.parse(await tool('gmail_get_message').run({ message_id: 'm' }, call));
  assert.equal(read.text, 'Hello you\nBye');
  assert.deepEqual(read.files, [{ name: 'a.pdf', type: 'application/pdf', size: 10 }]);
  assert.equal(read.unread, true);
  assert.equal(documentText([{ paragraph: { elements: [{ textRun: { content: 'Title\n' } }], paragraphStyle: { namedStyleType: 'HEADING_2' } } }, { paragraph: { elements: [{ textRun: { content: 'item\n' } }], bullet: {} } }, { table: { tableRows: [{ tableCells: [{ content: [{ paragraph: { elements: [{ textRun: { content: 'a\n' } }] } }] }, { content: [{ paragraph: { elements: [{ textRun: { content: 'b\n' } }] } }] }] }] } }]), '## Title\n- item\na\tb');
});

test('the client of a native connector lists its tools without the network, and asks the service for nothing until a tool is called', async () => {
  let calls = 0;
  const client = createNativeClient('google', { getToken: async () => 'T', fetchImpl: async () => { calls += 1; return json({}); } });
  const listed = await client.listTools();
  assert.equal(listed.length, nativeToolNames('google').length);
  assert.ok(listed.every((item) => item.description && item.inputSchema?.type === 'object'));
  assert.equal(calls, 0);
  assert.throws(() => createNativeClient('nothing', { getToken: async () => 'T' }));
});
