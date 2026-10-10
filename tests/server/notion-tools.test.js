import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { createKeyVault } from '../../server/key-vault.js';
import { ConnectorError, createConnectorService, effectiveState } from '../../server/mcp/connections.js';
import { NotionError, createNotionOAuth } from '../../server/notion/oauth.js';
import { NOTION_TOOLS, blocksToText, createNotionTools, normalizeId, propertyText, textToBlocks } from '../../server/notion/tools.js';
import { REST_CONNECTORS, getConnector, restConnectorOf, toolKind } from '../../src/data/connector-catalog.js';

const A = '123e4567-e89b-12d3-a456-426614174000';
const B = '223e4567-e89b-12d3-a456-426614174001';
const PAGE = '0123456789abcdef0123456789abcdef';
const PAGE_DASHED = '01234567-89ab-cdef-0123-456789abcdef';
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const rt = (text) => [{ type: 'text', plain_text: text, text: { content: text } }];

/** Notion's REST API as a fake: `routes` maps "METHOD /path" to a Response or a function of { url, body, headers }. Every call is recorded. */
function fakeRest(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(String(url));
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    const entry = { method, path: target.pathname.replace(/^\/v1/, ''), query: Object.fromEntries(target.searchParams), body, headers: options.headers || {} };
    calls.push(entry);
    const route = routes[`${method} ${entry.path}`];
    if (route === undefined) return json({ object: 'error', status: 404, code: 'object_not_found', message: 'not found' }, 404);
    return typeof route === 'function' ? route(entry) : route.clone();
  };
  return { fetchImpl, calls };
}
const oauthFor = () => {
  const expired = [];
  return { expired, accessToken: async (userId) => `token-of-${userId}`, markExpired: async (userId) => { expired.push(userId); } };
};
const toolsWith = (routes, extra = {}) => {
  const rest = fakeRest(routes);
  const oauth = oauthFor();
  return { ...rest, oauth, tools: createNotionTools({ oauth, fetchImpl: rest.fetchImpl, sleep: async () => {}, ...extra }) };
};
const run = (t, name, args, user = A) => t.tools.call(user, name, args);

test('the tools are the ones the catalog says read or write, with names a model can call and inputs that are objects', () => {
  const connector = restConnectorOf('notion');
  assert.equal(connector.id, 'notion-public');
  assert.deepEqual(NOTION_TOOLS.map((tool) => tool.name).sort(), [...connector.reads, ...connector.writes].sort(), 'the names are the same in the catalog and here');
  for (const tool of NOTION_TOOLS) {
    assert.match(tool.name, /^[A-Za-z0-9_.:-]{1,64}$/);
    assert.equal(tool.kind, toolKind(connector, tool.name), tool.name);
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.description.length > 20);
    for (const required of tool.inputSchema.required || []) assert.ok(required in tool.inputSchema.properties, `${tool.name}: ${required}`);
  }
  assert.deepEqual(NOTION_TOOLS.filter((tool) => tool.kind === 'write').map((tool) => tool.name), ['notion_create_page', 'notion_update_page', 'notion_append_content', 'notion_create_comment']);
  assert.equal(getConnector('notion-public').parent, 'notion');
  assert.equal(REST_CONNECTORS.length, 1);
});

test('an id is found in what the model gave: with or without dashes, or inside an address of Notion', () => {
  assert.equal(normalizeId(PAGE), PAGE_DASHED);
  assert.equal(normalizeId(PAGE_DASHED.toUpperCase()), PAGE_DASHED);
  assert.equal(normalizeId(`https://www.notion.so/My-Page-Title-${PAGE}?pvs=4`), PAGE_DASHED);
  assert.equal(normalizeId('not an id'), '');
  assert.equal(normalizeId(undefined), '');
  assert.equal(normalizeId('../../users'), '');
});

test('Notion\'s blocks are read as plain text with simple marks, and text written as simple Markdown becomes blocks', () => {
  const blocks = [
    { id: 'b1', type: 'heading_1', heading_1: { rich_text: rt('Plan') } },
    { id: 'b2', type: 'paragraph', paragraph: { rich_text: rt('Words') } },
    { id: 'b3', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('one') }, has_children: true },
    { id: 'b4', type: 'to_do', to_do: { rich_text: rt('ship'), checked: true } },
    { id: 'b5', type: 'code', code: { rich_text: rt('x = 1'), language: 'python' } },
    { id: 'b6', type: 'divider', divider: {} },
    { id: 'b7', type: 'child_page', child_page: { title: 'Sub' } },
    { id: 'b8', type: 'weird_new_block', weird_new_block: {} }
  ];
  const child = { id: 'c1', type: 'paragraph', paragraph: { rich_text: rt('under one') } };
  const text = blocksToText(blocks, (block) => (block.id === 'b3' ? [child] : []));
  assert.equal(text, ['# Plan', 'Words', '- one', '  under one', '- [x] ship', '```python', 'x = 1', '```', '---', '[page] Sub (id b7)', '[weird_new_block]'].join('\n'));

  const made = textToBlocks('# Title\n\n## Part\nplain line\n- item\n* other\n1. first\n2) second\n- [ ] todo\n- [x] done\n> quoted\n---\n```js\nlet a = 1;\n```\n```weirdlang\nzzz\n```');
  assert.deepEqual(made.map((block) => block.type), ['heading_1', 'heading_2', 'paragraph', 'bulleted_list_item', 'bulleted_list_item', 'numbered_list_item', 'numbered_list_item', 'to_do', 'to_do', 'quote', 'divider', 'code', 'code']);
  assert.equal(made[7].to_do.checked, false);
  assert.equal(made[8].to_do.checked, true);
  assert.equal(made[11].code.language, 'javascript');
  assert.equal(made[12].code.language, 'plain text', 'a language Notion does not know is plain text');
  assert.equal(made[11].code.rich_text[0].text.content, 'let a = 1;');
  // A long paragraph is cut into pieces Notion takes; the number of blocks is bounded.
  assert.deepEqual(textToBlocks('x'.repeat(4500))[0].paragraph.rich_text.map((part) => part.text.content.length), [2000, 2000, 500]);
  assert.equal(textToBlocks(Array.from({ length: 500 }, (_, index) => `line ${index}`).join('\n')).length, 300);
  assert.deepEqual(textToBlocks(''), []);
});

test('the value of a property is told as text, whatever its type', () => {
  assert.equal(propertyText({ type: 'select', select: { name: 'Todo' } }), 'Todo');
  assert.equal(propertyText({ type: 'multi_select', multi_select: [{ name: 'a' }, { name: 'b' }] }), 'a, b');
  assert.equal(propertyText({ type: 'date', date: { start: '2026-01-01', end: '2026-01-05' } }), '2026-01-01 → 2026-01-05');
  assert.equal(propertyText({ type: 'checkbox', checkbox: true }), 'yes');
  assert.equal(propertyText({ type: 'number', number: 0 }), '0');
  assert.equal(propertyText({ type: 'formula', formula: { type: 'string', string: 'ok' } }), 'ok');
  assert.equal(propertyText({ type: 'unique_id', unique_id: { prefix: 'ENG', number: 7 } }), 'ENG-7');
  assert.equal(propertyText({ type: 'rollup', rollup: {} }), '[rollup]');
  assert.equal(propertyText(null), '');
});

test('the reading tools ask Notion the right questions with the token of the person, and tell the answers as text', async () => {
  const t = toolsWith({
    'POST /search': json({ results: [{ object: 'page', id: PAGE_DASHED, url: 'https://notion.so/p', last_edited_time: '2026-10-01', properties: { Name: { type: 'title', title: rt('Roadmap') } } }, { object: 'database', id: 'd1', url: 'https://notion.so/d', title: rt('Tasks') }], has_more: false }),
    [`GET /pages/${PAGE_DASHED}`]: json({ object: 'page', id: PAGE_DASHED, url: 'https://notion.so/p', parent: { type: 'workspace' }, last_edited_time: '2026-10-01', properties: { Name: { type: 'title', title: rt('Roadmap') }, Status: { type: 'status', status: { name: 'Doing' } }, Empty: { type: 'rich_text', rich_text: [] } } }),
    [`GET /blocks/${PAGE_DASHED}/children`]: (call) => (call.query.start_cursor ? json({ results: [{ id: 'b2', type: 'paragraph', paragraph: { rich_text: rt('second page of blocks') } }], has_more: false }) : json({ results: [{ id: 'b1', type: 'heading_2', heading_2: { rich_text: rt('Goals') }, has_children: true }], has_more: true, next_cursor: 'cur1' })),
    '/placeholder': json({}),
    'GET /blocks/b1/children': json({ results: [{ id: 'k1', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt('grow') } }], has_more: false }),
    'GET /databases/dddddddd-dddd-dddd-dddd-dddddddddddd': json({ object: 'database', id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', url: 'https://notion.so/d', title: rt('Tasks'), properties: { Name: { type: 'title', title: {} }, Status: { type: 'status', status: { options: [{ name: 'Todo' }, { name: 'Done' }] } } } }),
    'POST /databases/dddddddd-dddd-dddd-dddd-dddddddddddd/query': json({ results: [{ object: 'page', id: 'r1', url: 'https://notion.so/r1', properties: { Name: { type: 'title', title: rt('Write docs') }, Status: { type: 'status', status: { name: 'Todo' } } } }], has_more: true }),
    'GET /comments': json({ results: [{ created_time: '2026-10-02', rich_text: rt('looks good') }] })
  });
  const search = await run(t, 'notion_search', { query: 'road', filter: 'page', page_size: 5 });
  assert.deepEqual(t.calls[0].body, { page_size: 5, sort: { direction: 'descending', timestamp: 'last_edited_time' }, query: 'road', filter: { property: 'object', value: 'page' } });
  assert.equal(t.calls[0].headers.authorization, `Bearer token-of-${A}`);
  assert.equal(t.calls[0].headers['notion-version'], '2022-06-28');
  assert.match(search.text, /\[page\] Roadmap — https:\/\/notion\.so\/p — id 01234567/);
  assert.match(search.text, /\[database\] Tasks/);
  assert.equal(search.isError, false);

  const page = await run(t, 'notion_get_page', { page_id: `https://notion.so/Roadmap-${PAGE}` });
  assert.match(page.text, /^Roadmap\naddress: https:\/\/notion\.so\/p/);
  assert.match(page.text, /Status: Doing/);
  assert.ok(!/Empty:/.test(page.text), 'an empty property is left out');

  const content = await run(t, 'notion_get_page_content', { page_id: PAGE });
  assert.equal(content.text, '## Goals\n  - grow\nsecond page of blocks');

  const database = await run(t, 'notion_get_database', { database_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' });
  assert.match(database.text, /- Status \(status\): Todo, Done/);

  const rows = await run(t, 'notion_query_database', { database_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', filter: { property: 'Status', status: { equals: 'Todo' } }, sorts: [{ property: 'Due', direction: 'ascending' }], page_size: 5 });
  const query = t.calls.find((call) => call.path.endsWith('/query'));
  assert.deepEqual(query.body, { page_size: 5, filter: { property: 'Status', status: { equals: 'Todo' } }, sorts: [{ property: 'Due', direction: 'ascending' }] });
  assert.match(rows.text, /Write docs — https:\/\/notion\.so\/r1 — id r1\n {4}Status: Todo/);
  assert.match(rows.text, /there are more/);

  assert.match((await run(t, 'notion_get_comments', { block_id: PAGE })).text, /2026-10-02: looks good/);
});

test('the writing tools send what Notion needs: a page under a page, a row in a database (with the name of its title property), long text in several requests, an update, a comment', async () => {
  const database = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const t = toolsWith({
    'POST /pages': (call) => json({ object: 'page', id: 'new-page-id', url: 'https://notion.so/new', properties: call.body.properties.title ? { title: { type: 'title', title: call.body.properties.title.title } } : { Task: { type: 'title', title: call.body.properties.Task.title } } }),
    [`GET /databases/${database}`]: json({ object: 'database', id: database, properties: { Task: { type: 'title', title: {} }, Status: { type: 'status', status: {} } } }),
    'PATCH /blocks/new-page-id/children': json({ results: [] }),
    [`PATCH /blocks/${PAGE_DASHED}/children`]: json({ results: [] }),
    [`PATCH /pages/${PAGE_DASHED}`]: (call) => json({ object: 'page', id: PAGE_DASHED, url: 'https://notion.so/p', archived: Boolean(call.body.archived), properties: { Name: { type: 'title', title: rt('Roadmap') } } }),
    'POST /comments': json({ object: 'comment' })
  });
  const under = await run(t, 'notion_create_page', { parent_page_id: PAGE, title: 'Notes', content: '# Hi\n- one', properties: { Tag: { select: { name: 'x' } } } });
  const created = t.calls.find((call) => call.method === 'POST' && call.path === '/pages');
  assert.deepEqual(created.body.parent, { page_id: PAGE_DASHED });
  assert.deepEqual(created.body.properties.title.title[0].text.content, 'Notes');
  assert.deepEqual(created.body.properties.Tag, { select: { name: 'x' } });
  assert.deepEqual(created.body.children.map((block) => block.type), ['heading_1', 'bulleted_list_item']);
  assert.match(under.text, /Created the page "Notes": https:\/\/notion\.so\/new/);

  t.calls.length = 0;
  await run(t, 'notion_create_page', { parent_database_id: database, title: 'Write docs', properties: { Status: { status: { name: 'Todo' } } }, content: Array.from({ length: 250 }, (_, index) => `line ${index}`).join('\n') });
  const row = t.calls.find((call) => call.method === 'POST' && call.path === '/pages');
  assert.deepEqual(row.body.parent, { database_id: database });
  assert.equal(row.body.properties.Task.title[0].text.content, 'Write docs', 'the title goes in the property that is the title of the database');
  assert.deepEqual(row.body.properties.Status, { status: { name: 'Todo' } });
  assert.equal(row.body.children.length, 100);
  assert.deepEqual(t.calls.filter((call) => call.method === 'PATCH').map((call) => call.body.children.length), [100, 50], 'the rest in requests of at most 100');

  t.calls.length = 0;
  const updated = await run(t, 'notion_update_page', { page_id: PAGE, properties: { Status: { status: { name: 'Done' } } }, archived: true });
  assert.deepEqual(t.calls[0].body, { properties: { Status: { status: { name: 'Done' } } }, archived: true });
  assert.match(updated.text, /\(archived\)/);

  const appended = await run(t, 'notion_append_content', { page_id: PAGE, content: '- a\n- b\n- c' });
  assert.equal(appended.text, 'Added 3 block(s) at the end of the page.');

  const comment = await run(t, 'notion_create_comment', { page_id: PAGE, text: 'Done!' });
  const sent = t.calls.find((call) => call.path === '/comments');
  assert.deepEqual(sent.body, { parent: { page_id: PAGE_DASHED }, rich_text: [{ type: 'text', text: { content: 'Done!' } }] });
  assert.equal(comment.text, 'Added the comment.');
});

test('inputs that are not right come back as an error the model can read, and Notion is not asked', async () => {
  const t = toolsWith({});
  for (const [name, args, pattern] of [
    ['notion_get_page', { page_id: 'nope' }, /`page_id` must be the id/],
    ['notion_get_page', {}, /`page_id`/],
    ['notion_create_page', { title: 'x' }, /exactly one of/],
    ['notion_create_page', { title: 'x', parent_page_id: PAGE, parent_database_id: PAGE }, /exactly one of/],
    ['notion_create_page', { title: '', parent_page_id: PAGE }, /`title` is needed/],
    ['notion_create_page', { title: 'x', parent_page_id: PAGE, properties: [] }, /`properties` must be an object/],
    ['notion_update_page', { page_id: PAGE }, /`properties` or `archived`/],
    ['notion_append_content', { page_id: PAGE, content: '\n\n' }, /nothing to add/],
    ['notion_query_database', { database_id: PAGE, filter: 'x' }, /`filter` must be an object/],
    ['notion_query_database', { database_id: PAGE, sorts: {} }, /`sorts` must be a list/],
    ['notion_create_comment', { page_id: PAGE, text: '' }, /`text` is needed/],
    ['not_a_tool', {}, /no tool called/]
  ]) {
    const result = await run(t, name, args);
    assert.equal(result.isError, true, name);
    assert.match(result.text, pattern, `${name} ${JSON.stringify(args)}`);
  }
  assert.equal(t.calls.length, 0, 'nothing was asked of Notion');
  assert.equal((await run(t, 'notion_get_page', 'not an object')).isError, true);
});

test('what Notion says is told so that the model can act: a page not shared, a refused request, a slow-down that is tried once more, and a login Notion no longer accepts', async () => {
  const t = toolsWith({
    [`GET /pages/${PAGE_DASHED}`]: json({ object: 'error', status: 404, code: 'object_not_found', message: 'Could not find page' }, 404),
    'POST /pages': json({ object: 'error', status: 400, code: 'validation_error', message: 'body.properties.Status.status.name should be defined' }, 400),
    'POST /comments': json({ object: 'error', status: 403, code: 'restricted_resource', message: 'no' }, 403),
    'GET /databases/eeeeeeee-eeeeee-eeee-eeee-eeeeeeeeeeee': json({}, 500)
  });
  const missing = await run(t, 'notion_get_page', { page_id: PAGE });
  assert.equal(missing.isError, true);
  assert.match(missing.text, /may not be shared with Noureon.*Connections/);
  const refused = await run(t, 'notion_create_page', { parent_page_id: PAGE, title: 'x' });
  assert.match(refused.text, /Notion refused the request: body\.properties\.Status/);
  assert.match((await run(t, 'notion_create_comment', { page_id: PAGE, text: 'x' })).text, /may not be shared/);

  let attempts = 0;
  const slept = [];
  const slow = toolsWith({ 'POST /search': () => { attempts += 1; return attempts === 1 ? json({ object: 'error' }, 429, { 'retry-after': '2' }) : json({ results: [] }); } }, { sleep: async (ms) => { slept.push(ms); } });
  assert.match((await run(slow, 'notion_search', {})).text, /Nothing found/);
  assert.deepEqual(slept, [2000], 'it waited as long as Notion said, once');
  attempts = -10;
  const always = toolsWith({ 'POST /search': json({ object: 'error' }, 429) });
  assert.match((await run(always, 'notion_search', {})).text, /slow down/);

  const down = toolsWith({ 'POST /search': json({ object: 'error', code: 'unauthorized' }, 401) });
  await assert.rejects(run(down, 'notion_search', {}), (error) => error instanceof NotionError && error.code === 'unauthorized');
  assert.deepEqual(down.oauth.expired, [A], 'the connection is told it needs a login');
  const broken = toolsWith({ 'POST /search': json({}, 500) });
  assert.equal((await run(broken, 'notion_search', {})).text, 'Notion could not do that now.');
  const offline = createNotionTools({ oauth: oauthFor(), fetchImpl: async () => { throw new Error('down: secret details'); } });
  assert.equal((await offline.call(A, 'notion_search', {})).text, 'Notion could not do that now.');
});

test('each person\'s calls carry their own token, and the answer is cut when long', async () => {
  const seen = [];
  const t = toolsWith({ 'POST /search': (call) => { seen.push(call.headers.authorization); return json({ results: [] }); } });
  await run(t, 'notion_search', {}, A);
  await run(t, 'notion_search', {}, B);
  assert.deepEqual(seen, [`Bearer token-of-${A}`, `Bearer token-of-${B}`]);
  const long = toolsWith({ [`GET /blocks/${PAGE_DASHED}/children`]: json({ results: Array.from({ length: 100 }, (_, index) => ({ id: `b${index}`, type: 'paragraph', paragraph: { rich_text: rt('y'.repeat(900)) } })), has_more: false }) });
  const result = await run(long, 'notion_get_page_content', { page_id: PAGE });
  assert.ok(result.text.length <= 24_000);
});

// ----- in the service: listed, set, given to a reply, cut

function serviceWith({ notion = true, fetchImpl = async () => json({ results: [] }) } = {}) {
  const rows = [];
  const matches = (filters) => (row) => Object.entries(filters || {}).every(([column, condition]) => {
    const [op, ...rest] = String(condition).split('.');
    return op === 'eq' ? String(row[column]) === rest.join('.') : true;
  });
  const db = {
    rows,
    select: async (table, { filters, limit } = {}) => rows.filter(matches(filters)).slice(0, limit || 1000).map((row) => ({ ...row })),
    upsert: async (table, row, { onConflict }) => {
      const keys = onConflict.split(',');
      const at = rows.findIndex((entry) => keys.every((key) => entry[key] === row[key]));
      if (at >= 0) rows[at] = { ...rows[at], ...row };
      else rows.push({ created_at: new Date().toISOString(), ...row });
    },
    remove: async (table, filters) => {
      for (let index = rows.length - 1; index >= 0; index -= 1) if (matches(filters)(rows[index])) rows.splice(index, 1);
    }
  };
  const vault = createKeyVault([{ version: 1, key: randomBytes(32).toString('base64') }]);
  const oauthNetwork = fakeRest({
    'POST /oauth/token': (call) => json({ access_token: `secret_${call.body.code}`, bot_id: 'b', workspace_id: 'w', workspace_name: `WS of ${call.body.code}`, workspace_icon: '' }),
    'POST /oauth/revoke': json({}),
    'GET /users/me': json({ object: 'user', name: 'Noureon', bot: { workspace_name: 'W' } })
  });
  const oauth = createNotionOAuth({ db, vault, fetchImpl: oauthNetwork.fetchImpl, config: { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://api.noureon.com/oauth/notion/callback' } });
  const restNetwork = fakeRest({ 'POST /search': json({ results: [] }) });
  const tools = createNotionTools({ oauth, fetchImpl: fetchImpl === undefined ? restNetwork.fetchImpl : restNetwork.fetchImpl });
  const service = createConnectorService({ db, vault, fetchImpl: async () => new Response('', { status: 404 }), config: { redirectUri: 'https://api.noureon.com/mcp/callback', cimdUrl: 'https://noureon.com/.well-known/oauth-client.json' }, notion: notion ? { oauth, tools } : null });
  const connect = async (user, code) => {
    const state = new URL((await oauth.startLogin(user, { returnTo: 'connectors' })).url).searchParams.get('state');
    return oauth.completeLogin({ state, code });
  };
  return { db, vault, oauth, tools, service, connect, restNetwork };
}

test('Notion through Noureon\'s own login is listed first among its kind with its tools and the person\'s states; without the login set up it is not there at all', async () => {
  const { service, connect } = serviceWith();
  let list = await service.list(A);
  assert.deepEqual(list.map((entry) => entry.id), ['notion-public', 'notion', 'linear']);
  assert.deepEqual({ ...list[0], tools: undefined }, { id: 'notion-public', parent: 'notion', backend: 'rest', status: 'none', mode: 'readwrite', tools: undefined, error: '', connectedAt: '', workspaceName: '' });
  assert.deepEqual(await connect(A, 'code-a'), { ok: true, returnTo: 'connectors' });
  list = await service.list(A);
  const rest = list[0];
  assert.equal(rest.status, 'connected');
  assert.equal(rest.workspaceName, 'WS of code-a');
  assert.deepEqual(rest.tools.map((tool) => [tool.name, tool.kind, tool.state]), [['notion_search', 'read', 'allow'], ['notion_get_page', 'read', 'allow'], ['notion_get_page_content', 'read', 'allow'], ['notion_get_database', 'read', 'allow'], ['notion_query_database', 'read', 'allow'], ['notion_get_comments', 'read', 'allow'], ['notion_create_page', 'write', 'ask'], ['notion_update_page', 'write', 'ask'], ['notion_append_content', 'write', 'ask'], ['notion_create_comment', 'write', 'ask']]);
  assert.ok(!JSON.stringify(list).includes('secret_code-a'), 'no token in what the person sees');
  assert.equal((await service.list(B))[0].status, 'none', 'another person has none');
  const without = serviceWith({ notion: false });
  assert.deepEqual((await without.service.list(A)).map((entry) => entry.id), ['notion', 'linear']);
  await assert.rejects(without.service.setPermissions(A, 'notion-public', {}), (error) => error.code === 'unknown_connector');
  assert.deepEqual(await without.service.forRun(A), []);
});

test('the person sets each tool as for any connector, and a reply is given the tools with those states, the hosted one told apart when both are connected', async () => {
  const { service, connect, db, vault } = serviceWith();
  await assert.rejects(service.setPermissions(A, 'notion-public', { notion_create_page: 'allow' }), (error) => error.code === 'not_connected');
  await connect(A, 'code-a');
  await service.setPermissions(A, 'notion-public', { notion_create_page: 'allow', notion_search: 'deny' });
  await assert.rejects(service.setPermissions(A, 'notion-public', { not_a_tool: 'allow' }), (error) => error.code === 'bad_request');
  await assert.rejects(service.setPermissions(A, 'notion-public', { notion_search: 'always' }), (error) => error.code === 'bad_request');
  const given = await service.forRun(A);
  assert.equal(given.length, 1);
  assert.equal(given[0].id, 'notion-public');
  assert.equal(given[0].name, 'Notion');
  const states = Object.fromEntries(given[0].tools.map((tool) => [tool.name, tool.state]));
  assert.equal(states.notion_create_page, 'allow');
  assert.equal(states.notion_search, 'deny');
  assert.equal(states.notion_update_page, 'ask');
  assert.ok(given[0].tools.every((tool) => tool.inputSchema?.type === 'object' && tool.description.length > 10));
  assert.deepEqual((await service.list(A))[0].tools.find((tool) => tool.name === 'notion_search').state, 'deny');
  // The hosted Notion also connected: both are given, and told apart.
  db.rows.push({ user_id: A, connector_id: 'notion', status: 'connected', mode: 'readwrite', tools: [{ name: 'notion-search', description: 'd', inputSchema: { type: 'object' }, kind: 'read', hash: 'h' }], changed: [], permissions: {}, tools_checked_at: new Date().toISOString(), envelope: 'x', key_version: 1 });
  const both = await service.forRun(A);
  assert.deepEqual(both.map((entry) => [entry.id, entry.name]), [['notion-public', 'Notion'], ['notion', 'Notion (full access)']]);
  void vault;
  assert.equal(effectiveState(restConnectorOf('notion'), { permissions: { notion_create_page: 'deny' }, changed: [] }, 'notion_create_page'), 'deny');
});

test('a reply calls the tool through the same client as the other connectors; a login Notion no longer accepts is the same "log in again", and the two ways do not mix', async () => {
  const { service, connect, oauth, db } = serviceWith();
  await connect(A, 'code-a');
  const client = service.clientFor(A, 'notion-public');
  assert.equal((await client.callTool('notion_search', {})).isError, false);
  await client.close();
  // Another person's client has no connection.
  await assert.rejects(service.clientFor(B, 'notion-public').callTool('notion_search', {}), (error) => error instanceof ConnectorError && error.code === 'login_needed');
  // Notion no longer accepts the token.
  const dead = serviceWith({});
  await dead.connect(A, 'x');
  const deadTools = createNotionTools({ oauth: dead.oauth, fetchImpl: async () => json({ object: 'error' }, 401) });
  const deadService = createConnectorService({ db: dead.db, vault: dead.vault, fetchImpl: async () => new Response('', { status: 404 }), config: { redirectUri: 'https://api.noureon.com/mcp/callback', cimdUrl: 'https://noureon.com/.well-known/oauth-client.json' }, notion: { oauth: dead.oauth, tools: deadTools } });
  await assert.rejects(deadService.clientFor(A, 'notion-public').callTool('notion_search', {}), (error) => error instanceof ConnectorError && error.code === 'login_needed');
  assert.equal((await deadService.list(A))[0].status, 'needs_login');
  // The hosted way has no business with the connection of the other way.
  await assert.rejects(service.startLogin(A, 'notion-public', 'readwrite'), (error) => error.code === 'unknown_connector');
  await assert.rejects(service.refreshTools(A, 'notion-public'), (error) => error.code === 'unknown_connector');
  await assert.rejects(service.accessToken(A, 'notion-public'), (error) => error.code === 'unknown_connector');
  // And a state of the other way is not a login of the hosted one.
  const state = new URL((await oauth.startLogin(A, { returnTo: 'connectors' })).url).searchParams.get('state');
  const outcome = await service.completeLogin({ state, code: 'c' });
  assert.equal(outcome.ok, false);
  assert.equal(db.rows.find((row) => row.connector_id === 'notion-public').status, 'connected', 'the connection of the other way is left as it was');
});

test('disconnecting Notion through Noureon\'s own login revokes the token at Notion and deletes it, without touching anyone else\'s', async () => {
  const { service, connect, db } = serviceWith();
  await connect(A, 'code-a');
  await connect(B, 'code-b');
  assert.deepEqual(await service.disconnect(A, 'notion-public'), { revoked: true });
  assert.equal(db.rows.filter((row) => row.user_id === A && row.connector_id === 'notion-public').length, 0);
  assert.equal((await service.list(B))[0].status, 'connected');
  assert.equal((await service.list(A))[0].status, 'none');
});
