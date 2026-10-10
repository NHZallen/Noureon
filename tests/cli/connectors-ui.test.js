import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { registerServerRequest } from '../../src/app/runtime/cli/cli-server-bridge.js';
import { CONNECTOR_TEXTS, connectorText } from '../../src/app/runtime/connector/connector-texts.js';
import { createConnectorAskCards, argumentSummary } from '../../src/app/ui/sandbox/connector-ask-card.js';
import { createConnectorsPart } from '../../src/app/ui/cli/connectors-part.js';
import { CONNECTORS } from '../../src/data/connector-catalog.js';
import { createConnectorAnswerHandler } from '../../src/app/runtime/connector/connector-answer.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

const tool = (name, kind, state, extra = {}) => ({ name, description: `${name} description`, kind, state, changed: false, ...extra });
const LINEAR = {
  id: 'linear',
  status: 'connected',
  mode: 'readwrite',
  error: '',
  tools: [tool('list_issues', 'read', 'allow'), tool('get_issue', 'read', 'allow'), tool('create_issue', 'write', 'ask'), tool('update_issue', 'write', 'ask'), tool('delete_comment', 'write', 'deny')]
};

/** A page and a server that answers the calls of the connectors part; `calls` records them. */
function setup({ account = true, connections = [LINEAR], language = 'zh-TW', failPut = false, startUrl = 'https://auth.linear.app/authorize?x=1' } = {}) {
  const window = new Window({ url: 'https://example.test/connectors' });
  const { document } = window;
  document.body.innerHTML = '<div class="cs"></div>';
  const calls = [];
  const data = new Map(connections.map((entry) => [entry.id, JSON.parse(JSON.stringify(entry))]));
  registerServerRequest(async (method, path, options = {}) => {
    calls.push([method, path, options.body ? JSON.parse(options.body) : null]);
    if (method === 'GET' && path === '/v1/connectors') return { ok: true, status: 200, data: { connectors: CONNECTORS.map((connector) => data.get(connector.id) || { id: connector.id, status: 'none', mode: 'readwrite', tools: [], error: '' }) } };
    if (method === 'POST' && /\/connect$/.test(path)) return { ok: true, status: 200, data: { url: startUrl } };
    if (method === 'POST' && /\/disconnect$/.test(path)) { data.delete(path.split('/')[3]); return { ok: true, status: 200, data: { ok: true, revoked: true } }; }
    if (method === 'PUT' && /\/permissions$/.test(path)) return failPut ? { ok: false, status: 500, code: 'internal_error', data: {} } : { ok: true, status: 200, data: { ok: true } };
    if (method === 'POST' && /\/refresh$/.test(path)) return { ok: true, status: 200, data: { ok: true, connectors: [data.get(path.split('/')[3])] } };
    return { ok: false, status: 404, code: 'not_found', data: {} };
  });
  const notices = [];
  const assigned = [];
  const replaced = [];
  const listeners = new Map();
  const fakeWin = {
    location: { assign: (url) => assigned.push(url) },
    history: { state: null, replaceState: (state, title, url) => replaced.push(url) },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); }
  };
  const view = { tab: 'all', query: '' };
  const host = document.querySelector('.cs');
  let part = null;
  const draw = () => host.replaceChildren(...part.draw(view, { showMine: () => { view.tab = 'mine'; draw(); } }));
  part = createConnectorsPart({ document, win: fakeWin, t: (key, values) => connectorText(language, key, values), getLanguage: () => language, getAccountReady: () => account, redraw: draw, showNotification: (text, kind) => notices.push([text, kind]) });
  return { window, document, host, part, view, draw, calls, notices, assigned, replaced, data, listeners };
}
const settle = async (t) => { t.draw(); await flush(); await flush(); };
const names = (t, selector) => [...t.host.querySelectorAll(selector)].map((node) => node.textContent);

test('the list: the connectors are in their groups, each with its words, "Connected" or "Connect", and a search finds one', async () => {
  const t = setup();
  await settle(t);
  assert.deepEqual(names(t, '.cs-section-title'), ['筆記與專案', '開發']);
  assert.deepEqual(names(t, '.cs-name-text'), ['Notion', 'Linear', 'Context7', 'Upstash', 'Vercel']);
  assert.equal(t.host.querySelector('[data-connector-id="linear"] .cs-conn-status').textContent, '已連線');
  assert.match(t.host.querySelector('[data-connector-id="notion"] .cs-connect').textContent, /連線/);
  assert.equal(t.calls.filter(([method, path]) => path === '/v1/connectors' && method === 'GET').length, 1, 'read once, not at every drawing');
  t.view.query = 'notion';
  t.draw();
  assert.deepEqual(names(t, '.cs-name-text'), ['Notion']);
  t.view.query = 'zzz';
  t.draw();
  assert.equal(t.host.querySelector('.cs-empty').textContent, '找不到符合的連接器。');
});

test('every word is in the five languages, the same keys in each', () => {
  const keys = Object.keys(CONNECTOR_TEXTS['zh-TW']);
  for (const [language, table] of Object.entries(CONNECTOR_TEXTS)) {
    assert.deepEqual(Object.keys(table), keys, language);
    for (const [key, value] of Object.entries(table)) assert.ok(String(value).trim(), `${language} ${key}`);
  }
  assert.equal(Object.keys(CONNECTOR_TEXTS).length, 5);
  // The words of the rows of the step list (the server writes them), in the five languages too.
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['connectorCalling', 'connectorListing', 'connectorWaiting', 'connectorAskTitle', 'connectorAskOnce', 'connectorAskAlways', 'connectorAskDeny', 'connectorAskParams', 'connectorAskHideParams', 'connectorAskWait', 'connectorAnsweredOnce', 'connectorAnsweredAlways', 'connectorAnsweredDeny', 'connectorAnsweredTimeout', 'connectorAskFailed']) assert.ok(key in CONNECTOR_TEXTS[language], `${language} ${key}`);
  }
});

test('without an account there is nothing to list (the page says why), and a connector cannot be begun', async () => {
  const t = setup({ account: false });
  await settle(t);
  assert.equal(t.host.children.length, 0);
  assert.equal(t.calls.length, 0, 'nothing is asked of the server');
});

test('connecting: the sheet says what happens, a service with a read-only login lets the person choose it, and the whole page goes to the service', async () => {
  const t = setup({ connections: [] });
  await settle(t);
  t.host.querySelector('[data-connector-id="linear"] .cs-action').click();
  const sheet = t.host.querySelector('.cs-dialog');
  assert.ok(sheet, 'the sheet opens inside the page');
  assert.match(sheet.textContent, /連線 Linear/);
  assert.equal(sheet.querySelectorAll('.cs-seg-item').length, 2, 'read-only or read and write');
  assert.equal(sheet.querySelector('.cs-seg-item[aria-pressed="true"]').textContent, '可讀寫連線');
  sheet.querySelector('.cs-seg-item').click();
  assert.equal(t.host.querySelector('.cs-dialog .cs-seg-item[aria-pressed="true"]').textContent, '唯讀連線');
  assert.match(t.host.querySelector('.cs-dialog').textContent, /令牌本身就無法寫入/);
  assert.match(t.host.querySelector('.cs-dialog').textContent, /模型供應商/, 'where the data goes is said');
  t.host.querySelector('.cs-dialog .cs-button-primary').click();
  await flush();
  assert.deepEqual(t.calls.at(-1), ['POST', '/v1/connectors/linear/connect', { mode: 'readonly' }]);
  assert.deepEqual(t.assigned, ['https://auth.linear.app/authorize?x=1'], 'the page itself goes there: no pop-up');
  assert.equal(t.part.state.sheet !== null, true);
  t.part.closeSheet();
  assert.equal(t.host.querySelector('.cs-dialog'), null);

  // A service that has only one login says so, and there is no choice.
  t.draw();
  t.host.querySelector('[data-connector-id="notion"] .cs-action').click();
  assert.equal(t.host.querySelector('.cs-dialog .cs-seg'), null);
  assert.match(t.host.querySelector('.cs-dialog').textContent, /授權包含寫入權限/);
});

test('a login that cannot begin says so and leaves the sheet to try again', async () => {
  const t = setup({ connections: [] });
  registerServerRequest(async (method, path) => (method === 'GET' ? { ok: true, status: 200, data: { connectors: [] } } : { ok: false, status: 502, code: 'internal_error', data: {} }));
  await settle(t);
  t.host.querySelector('[data-connector-id="notion"] .cs-action').click();
  t.host.querySelector('.cs-dialog .cs-button-primary').click();
  await flush();
  const error = t.host.querySelector('.cs-dialog-error');
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, '無法開始登入，請稍後再試。');
  assert.equal(t.host.querySelector('.cs-dialog .cs-button-primary').disabled, false);
  assert.deepEqual(t.assigned, []);
});

test('a login that is refused says why, in the code and the status the service gave, and nothing more', async () => {
  const t = setup({ connections: [] });
  await settle(t);
  registerServerRequest(async (method) => (method === 'GET' ? { ok: true, status: 200, data: { connectors: [] } } : { ok: false, status: 400, code: 'bad_request', data: { error: { code: 'bad_request', message: 'x', reason: 'failed', detail: 'registration_refused 403' } } }));
  t.host.querySelector('[data-connector-id="vercel"] .cs-action').click();
  t.host.querySelector('.cs-dialog .cs-button-primary').click();
  await flush();
  assert.equal(t.host.querySelector('.cs-dialog-error').textContent, '無法開始登入，請稍後再試。 (registration_refused 403)');
});

test('Mine: a connection shows its access and its tools in two groups; the group is one setting, the tools each their own', async () => {
  const t = setup();
  t.view.tab = 'mine';
  await settle(t);
  const card = t.host.querySelector('[data-connector-id="linear"]');
  assert.ok(card);
  assert.equal(card.querySelector('.cs-conn-status').textContent, '已連線');
  assert.deepEqual([...card.querySelectorAll('.cs-conn-card .cs-group-title')].map((node) => node.textContent), ['連線範圍', '讀取工具 (2)', '寫入工具 (3)']);
  const groups = [...card.querySelectorAll('.cs-group')];
  const pressed = (group) => group.querySelector('.cs-group-head .cs-seg-item[aria-pressed="true"]').textContent;
  assert.equal(pressed(groups[0]), '允許', 'reads are allowed');
  assert.equal(pressed(groups[1]), '詢問', 'most writes ask');
  assert.match(groups[1].querySelector('.cs-group-toggle').textContent, /個別設定 \(1 個與整組不同\)/, 'the one that differs is counted');
  assert.equal(groups[1].querySelector('.cs-tools'), null, 'closed: no list');

  groups[1].querySelector('.cs-group-toggle').click();
  const opened = t.host.querySelectorAll('.cs-group')[1];
  assert.deepEqual([...opened.querySelectorAll('.cs-tool-name')].map((node) => node.textContent), ['create_issue', 'update_issue', 'delete_comment']);
  assert.equal(opened.querySelectorAll('.cs-tool')[2].querySelector('.cs-seg-item[aria-pressed="true"]').textContent, '拒絕');
  // One tool: allow it. Whatever the person chooses is what is kept, a write too.
  opened.querySelectorAll('.cs-tool')[0].querySelectorAll('.cs-seg-item')[0].click();
  await flush();
  assert.deepEqual(t.calls.at(-1), ['PUT', '/v1/connectors/linear/permissions', { tools: { create_issue: 'allow' } }]);
  assert.equal(t.host.querySelectorAll('.cs-group')[1].querySelectorAll('.cs-tool')[0].querySelector('.cs-seg-item[aria-pressed="true"]').textContent, '允許');
  // The whole group at once: refuse every write.
  t.host.querySelectorAll('.cs-group')[1].querySelectorAll('.cs-group-head .cs-seg-item')[2].click();
  await flush();
  assert.deepEqual(t.calls.at(-1), ['PUT', '/v1/connectors/linear/permissions', { tools: { create_issue: 'deny', update_issue: 'deny', delete_comment: 'deny' } }]);
});

test('a dangerous tool may be set to "allow" like any other: nothing is added to the screen to stop or warn', async () => {
  const t = setup({ connections: [{ ...LINEAR, tools: [tool('delete_everything', 'write', 'ask')] }] });
  t.view.tab = 'mine';
  await settle(t);
  t.host.querySelector('.cs-group-toggle').click();
  const text = t.host.textContent;
  assert.ok(!/高風險|警告|危險/.test(text));
  t.host.querySelector('.cs-tool .cs-seg-item').click();
  await flush();
  assert.deepEqual(t.calls.at(-1), ['PUT', '/v1/connectors/linear/permissions', { tools: { delete_everything: 'allow' } }]);
});

test('a setting the server did not keep is put back, and the person is told', async () => {
  const t = setup({ failPut: true });
  t.view.tab = 'mine';
  await settle(t);
  t.host.querySelectorAll('.cs-group')[0].querySelectorAll('.cs-group-head .cs-seg-item')[2].click();
  await flush();
  await flush();
  assert.equal(t.host.querySelectorAll('.cs-group')[0].querySelector('.cs-group-head .cs-seg-item[aria-pressed="true"]').textContent, '允許', 'back as it was');
  assert.deepEqual(t.notices.at(-1), ['設定沒有儲存，請再試一次。', 'error']);
});

test('a tool that changed is shown as such, and the group does not set it: the person looks at it alone', async () => {
  const changed = { ...LINEAR, tools: [tool('list_issues', 'read', 'allow'), tool('get_issue', 'read', 'deny', { changed: true })] };
  const t = setup({ connections: [changed] });
  t.view.tab = 'mine';
  await settle(t);
  const group = t.host.querySelector('.cs-group');
  assert.equal(group.querySelector('.cs-group-head .cs-seg-item[aria-pressed="true"]').textContent, '允許', 'the group is judged by the tools that were seen');
  group.querySelectorAll('.cs-group-head .cs-seg-item')[1].click();
  await flush();
  assert.deepEqual(t.calls.at(-1)[2], { tools: { list_issues: 'ask' } }, 'the changed tool is not in it');
  t.host.querySelector('.cs-group-toggle').click();
  assert.match(t.host.querySelector('.cs-tool-changed').textContent, /需要你重新確認/);
  t.host.querySelectorAll('.cs-tool')[1].querySelectorAll('.cs-seg-item')[0].click();
  await flush();
  assert.deepEqual(t.calls.at(-1)[2], { tools: { get_issue: 'allow' } }, 'on its own it is confirmed');
});

test('a description from a service is text, never markup', async () => {
  const hostile = { ...LINEAR, tools: [tool('list_issues', 'read', 'allow', { description: '<img src=x onerror="window.pwned=1"><b>bold</b>' })] };
  const t = setup({ connections: [hostile] });
  t.view.tab = 'mine';
  await settle(t);
  t.host.querySelector('.cs-group-toggle').click();
  assert.equal(t.host.querySelector('.cs-tool-desc').textContent, '<img src=x onerror="window.pwned=1"><b>bold</b>');
  assert.equal(t.host.querySelectorAll('.cs-tool img, .cs-tool b').length, 0);
});

test('disconnecting asks to be sure, then removes the connection from the list; changing the access is a new login', async () => {
  const t = setup();
  t.view.tab = 'mine';
  await settle(t);
  const card = () => t.host.querySelector('[data-connector-id="linear"]');
  card().querySelector('.cs-conn-side .cs-button').click();
  assert.equal(card().querySelector('.cs-button-danger').textContent, '確定中斷連線');
  card().querySelector('.cs-conn-side .cs-button:not(.cs-button-danger)').click();
  assert.equal(card().querySelector('.cs-button-danger'), null, 'cancelled');
  // Another access: the sheet of a new login, with the other choice.
  card().querySelectorAll('.cs-conn-card')[0].querySelectorAll('.cs-seg-item')[0].click();
  assert.match(t.host.querySelector('.cs-dialog').textContent, /切換連線範圍需要重新登入 Linear/);
  assert.equal(t.host.querySelector('.cs-dialog .cs-seg-item[aria-pressed="true"]').textContent, '唯讀連線');
  t.part.closeSheet();
  card().querySelector('.cs-conn-side .cs-button').click();
  card().querySelector('.cs-button-danger').click();
  await flush();
  await flush();
  assert.deepEqual(t.calls.find(([, path]) => path.endsWith('/disconnect')), ['POST', '/v1/connectors/linear/disconnect', null]);
  assert.equal(t.host.querySelector('[data-connector-id="linear"]'), null);
  assert.deepEqual(t.notices.at(-1), ['已中斷連線：Linear', 'success']);
});

test('a login that has ended says so and offers to log in again; its tools are not shown', async () => {
  const t = setup({ connections: [{ ...LINEAR, status: 'needs_login' }] });
  t.view.tab = 'mine';
  await settle(t);
  const card = t.host.querySelector('[data-connector-id="linear"]');
  assert.equal(card.querySelector('.cs-conn-status').textContent, '需要重新登入');
  assert.ok(card.querySelector('.cs-conn-status').classList.contains('is-warning'));
  assert.equal(card.querySelectorAll('.cs-group').length, 0);
  assert.ok([...card.querySelectorAll('.cs-conn-side .cs-button')].some((button) => button.textContent === '重新登入'));
});

test('coming back from the service: the result is told, the address is cleaned, and a new connection is shown under Mine', async () => {
  const t = setup();
  assert.deepEqual(t.part.handleReturn('?connector=linear&connected=1'), { goMine: true });
  assert.deepEqual(t.notices.at(-1), ['已連線：Linear', 'success']);
  assert.deepEqual(t.replaced, ['/connectors']);
  assert.deepEqual(t.part.handleReturn('?connector=linear&connector_error=denied'), { goMine: false });
  assert.deepEqual(t.notices.at(-1), ['你取消了登入。', 'error']);
  t.part.handleReturn('?connector_error=bad_state');
  assert.equal(t.notices.at(-1)[0], '這個登入連結已失效，請重新連線。');
  t.part.handleReturn('?connector_error=something-odd');
  assert.equal(t.notices.at(-1)[0], '連線失敗，請稍後再試。');
  const quiet = t.notices.length;
  assert.deepEqual(t.part.handleReturn(''), { goMine: false });
  assert.deepEqual(t.part.handleReturn('?utm=x'), { goMine: false });
  assert.equal(t.notices.length, quiet, 'an ordinary address says nothing');
});

// ----- the card in the step list

const cardSetup = (language = 'en') => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="host"></div>';
  const answers = [];
  const cards = createConnectorAskCards({ document, host: document.getElementById('host'), language, onAnswer: async (answer) => { answers.push(answer); return { ok: true }; } });
  return { document, cards, answers };
};
const ASK = { type: 'connector', event: 'ask', id: 'ask-0001-aaaa', connector: { id: 'vercel', name: 'Vercel' }, tool: 'deploy_to_vercel', kind: 'write', args: JSON.stringify({ project: 'noureon-web', branch: 'main', env: 'production', flags: { force: true } }, null, 2), argsCut: false, waitMs: 600000 };

test('the card says which connector wants which tool, shows the first values and every input on request, and has three answers', async () => {
  const { document, cards, answers } = cardSetup();
  cards.handle(ASK);
  cards.handle(ASK);
  assert.equal(document.querySelectorAll('.connector-ask').length, 1, 'a question that comes again (a page that joined late) is one card');
  assert.equal(document.querySelector('.net-ask-title').textContent, 'Vercel wants to run: deploy_to_vercel');
  assert.equal(document.querySelector('.connector-ask-mark img').getAttribute('src'), 'https://github.com/vercel.png?size=96', 'a connector of the catalog has its own picture');
  assert.equal(document.querySelector('.connector-ask-values').textContent, 'noureon-web · main · production');
  const detail = document.querySelector('.connector-ask-detail');
  assert.equal(detail.hidden, true);
  document.querySelector('.connector-ask-toggle').click();
  assert.equal(detail.hidden, false);
  assert.match(detail.textContent, /"force": true/, 'every input, including the nested ones');
  assert.deepEqual([...document.querySelectorAll('.net-ask-button')].map((button) => button.textContent), ['Allow once', 'Always allow', 'Refuse']);
  assert.equal(cards.open, 1);
  document.querySelectorAll('.net-ask-button')[1].click();
  await flush();
  assert.deepEqual(answers, [{ id: 'ask-0001-aaaa', decision: 'always' }]);
  // The card settles when the server says it took the answer (every page gets that event).
  assert.equal(document.querySelector('.connector-ask').classList.contains('is-resolved'), false);
  cards.handle({ type: 'connector', event: 'answer', id: 'ask-0001-aaaa', decision: 'always', connector: ASK.connector, tool: ASK.tool });
  assert.equal(document.querySelector('.net-ask-title').textContent, 'Always allowed: Vercel · deploy_to_vercel');
  assert.equal(document.querySelectorAll('.net-ask-button').length, 0);
  assert.equal(document.querySelector('.connector-ask-detail'), null);
  assert.equal(cards.open, 0);
});

test('a refusal, and a question nobody answered, are shown as refused', () => {
  const { document, cards } = cardSetup('zh-TW');
  cards.handle(ASK);
  cards.handle({ ...ASK, id: 'ask-0002-bbbb' });
  cards.handle({ type: 'connector', event: 'answer', id: 'ask-0001-aaaa', decision: 'deny', connector: ASK.connector, tool: ASK.tool });
  cards.handle({ type: 'connector', event: 'answer', id: 'ask-0002-bbbb', decision: 'timeout', connector: ASK.connector, tool: ASK.tool });
  const titles = [...document.querySelectorAll('.net-ask-title')].map((node) => node.textContent);
  assert.deepEqual(titles, ['已拒絕：Vercel · deploy_to_vercel', '沒有及時回答，已拒絕：Vercel · deploy_to_vercel']);
  assert.ok([...document.querySelectorAll('.connector-ask')].every((node) => node.classList.contains('is-refused')));
});

test('an answer that could not be sent can be tried again; what the model gave is put in as text', async () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="host"></div>';
  let tries = 0;
  const cards = createConnectorAskCards({ document, host: document.getElementById('host'), language: 'en', onAnswer: async () => { tries += 1; return { ok: tries > 1 }; } });
  cards.handle({ ...ASK, connector: { id: 'x', name: '<b>Evil</b>' }, tool: '<script>x</script>', args: '<img src=x onerror=alert(1)>' });
  assert.equal(document.querySelectorAll('.connector-ask img, .connector-ask b, .connector-ask script').length, 0);
  const buttons = () => [...document.querySelectorAll('.net-ask-button')];
  buttons()[0].click();
  await flush();
  assert.equal(document.querySelector('.net-ask-failed').hidden, false);
  assert.equal(buttons().every((button) => !button.disabled), true, 'the buttons come back');
});

test('the values of the inputs are summarised in a line, and an answer goes to the reply that asked', async () => {
  assert.equal(argumentSummary('{"a":"one","b":2,"c":true,"d":{"x":1},"e":"","f":"four","g":"five"}'), 'one · 2 · true');
  assert.equal(argumentSummary('not json'), '');
  assert.equal(argumentSummary('[1,2]'), '');
  assert.equal(argumentSummary(JSON.stringify({ a: 'x'.repeat(100) })).length, 40);
  const sent = [];
  const handler = createConnectorAnswerHandler({ getRun: () => ({ answerConnector: async (id, decision) => { sent.push([id, decision]); return { ok: true }; } }) });
  assert.deepEqual(await handler({ id: 'a', decision: 'once' }), { ok: true });
  assert.deepEqual(sent, [['a', 'once']]);
  assert.deepEqual(await createConnectorAnswerHandler({ getRun: () => null })({ id: 'a', decision: 'once' }), { ok: false });
});

test('the styles of the part use the colours of the app and nothing of their own', () => {
  const css = readFileSync(new URL('../../src/app/ui/cli/cli-store.css', import.meta.url), 'utf8');
  const part = css.slice(css.indexOf('The connectors part (connectors-part.js)'));
  assert.ok(part.length > 500);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(part), 'no colour of its own');
  const ledger = readFileSync(new URL('../../src/styles/ledger.css', import.meta.url), 'utf8');
  const ask = ledger.slice(ledger.indexOf('The question whether a tool of a connector may run'), ledger.indexOf('A file a step made that is not offered'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(ask));
});

test('the questions to the person are in the conversation under the line of the steps, not inside the folded steps', async () => {
  const { createSandboxLedger } = await import('../../src/app/ui/sandbox/sandbox-ledger.js');
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="message"><div id="answer"></div></div>';
  const ledger = createSandboxLedger({ document, host: document.getElementById('message'), before: document.getElementById('answer'), language: 'zh-TW', summary: true, onConnectorAnswer: async () => ({ ok: true }) });
  ledger.event({ type: 'connector', event: 'call', connector: 'notion', tool: 'notion-create-pages', label: '使用連接器：Notion · notion-create-pages' });
  ledger.event({ ...ASK, connector: { id: 'notion', name: 'Notion' }, tool: 'notion-create-pages' });
  ledger.event({ type: 'net', event: 'ask', id: 'net-ask-0001', host: 'example.org', port: 443, waitMs: 600000 });
  await flush();
  await flush();
  const hostBox = document.querySelector('.ask-host');
  assert.ok(hostBox, 'a place for the questions');
  assert.equal(hostBox.querySelectorAll('.net-ask').length, 2, 'the question about the tool and the one about the site');
  assert.equal(document.querySelector('.ledger-body .net-ask, .ledger-list .net-ask'), null, 'none of them inside the steps');
  assert.equal(hostBox.previousElementSibling.classList.contains('ledger'), true, 'right under the line of the steps');
  assert.equal(hostBox.nextElementSibling.id, 'answer', 'and above the answer');
  ledger.remove();
  assert.equal(document.querySelector('.ask-host'), null);
});

test('the sheet that begins a login can always be closed, and the button is put back when the person comes back from the service with the back button', async () => {
  const t = setup({ connections: [] });
  await settle(t);
  t.host.querySelector('[data-connector-id="linear"] .cs-action').click();
  const go = t.host.querySelector('.cs-dialog .cs-button-primary');
  go.click();
  await flush();
  assert.equal(go.disabled, true, 'while it goes');
  assert.equal(t.host.querySelector('.cs-dialog .cs-button:not(.cs-button-primary)').disabled, false, 'cancel is never disabled');
  assert.equal(go.textContent, '正在前往……');
  // The person comes back with the back button: the page is shown as it was left, and is put back.
  t.listeners.get('pageshow')();
  assert.equal(go.disabled, false);
  assert.equal(go.textContent, '前往登入');
  t.host.querySelector('.cs-dialog .cs-button:not(.cs-button-primary)').click();
  assert.equal(t.host.querySelector('.cs-dialog'), null);
  assert.equal(t.listeners.has('pageshow'), false, 'the listener goes with the sheet');
});

test('in the list every connector opens where it is, with words about what it can do and requests to try; the page does not turn to Mine, and the right side still connects', async () => {
  const t = setup();
  await settle(t);
  const linear = () => t.host.querySelector('[data-connector-id="linear"]');
  assert.equal(linear().classList.contains('is-open'), false);
  linear().querySelector('.cs-text').click();
  assert.equal(t.view.tab, 'all', 'the page stays where it is');
  assert.equal(linear().classList.contains('is-open'), true);
  assert.equal(linear().querySelector('.cs-more').classList.contains('is-open'), true);
  assert.equal(linear().querySelector('.cs-text').getAttribute('aria-expanded'), 'true');
  assert.match(linear().querySelector('.cs-about').textContent, /連接 Linear 後，模型可以查詢你的議題、專案與週期/);
  assert.equal(linear().querySelector('.cs-examples-title').textContent, '可以這樣問');
  assert.equal(linear().querySelectorAll('.cs-examples-list li').length, 3);
  assert.equal(linear().querySelector('.cs-feature'), null, 'words about it, not a list of its tools');
  const element = linear();
  // It opens and closes in place: the row is the same element, not a new one.
  element.querySelector('.cs-text').click();
  assert.equal(linear(), element);
  assert.equal(element.classList.contains('is-open'), false);
  assert.equal(element.querySelector('.cs-more').getAttribute('aria-hidden'), 'true');
  // The status of a good connection opens the words too; an open row stays open when the page is drawn again (a search, a setting).
  element.querySelector('.cs-action').click();
  t.draw();
  assert.equal(linear().classList.contains('is-open'), true);
  // The way to the settings of the tools (only for a connection).
  linear().querySelector('.cs-feature-manage').click();
  assert.equal(t.view.tab, 'mine');
  // One that is not connected opens its words too (a person reads what it is before connecting); the right side connects.
  t.view.tab = 'all';
  t.draw();
  const notion = () => t.host.querySelector('[data-connector-id="notion"]');
  notion().querySelector('.cs-text').click();
  assert.equal(notion().classList.contains('is-open'), true);
  assert.equal(notion().querySelector('.cs-feature-manage'), null, 'nothing to manage before it is connected');
  assert.equal(t.host.querySelector('.cs-dialog'), null);
  notion().querySelector('.cs-action').click();
  assert.ok(t.host.querySelector('.cs-dialog'), 'the right side begins the connection');
});

test('a connection that needs a login: the right side opens the sheet to log in again, the words open from the left', async () => {
  const t = setup({ connections: [{ ...LINEAR, status: 'needs_login' }] });
  await settle(t);
  const row = () => t.host.querySelector('[data-connector-id="linear"]');
  row().querySelector('.cs-text').click();
  assert.equal(row().classList.contains('is-open'), true);
  assert.equal(t.host.querySelector('.cs-dialog'), null);
  row().querySelector('.cs-action').click();
  assert.match(t.host.querySelector('.cs-dialog').textContent, /連線 Linear/);
});

test('under Mine the permissions fold and unfold; they are open at first', async () => {
  const t = setup();
  t.view.tab = 'mine';
  await settle(t);
  const fold = () => t.host.querySelector('[data-connector-id="linear"] .cs-fold');
  assert.equal(fold().classList.contains('is-open'), true);
  assert.equal(fold().querySelector('.cs-fold-title').textContent, '權限');
  assert.ok(fold().querySelector('.cs-group'));
  fold().querySelector('.cs-fold-head').click();
  assert.equal(fold().classList.contains('is-open'), false);
  assert.equal(fold().querySelector('.cs-group'), null, 'folded: nothing of them is drawn');
  assert.equal(fold().querySelector('.cs-fold-head').getAttribute('aria-expanded'), 'false');
  fold().querySelector('.cs-fold-head').click();
  assert.ok(fold().querySelector('.cs-group'));
});

test('the permissions for the settings: one folded section for each connection, opened one at a time by the person', async () => {
  const t = setup({ connections: [LINEAR, { ...LINEAR, id: 'notion', tools: [tool('notion-search', 'read', 'allow'), tool('notion-create-pages', 'write', 'ask')] }] });
  await flush();
  let nodes = t.part.permissionNodes();
  await flush();
  await flush();
  const box = t.document.createElement('div');
  const show = () => box.replaceChildren(...t.part.permissionNodes());
  show();
  assert.deepEqual([...box.querySelectorAll('.cs-perm .cs-fold-title')].map((node) => node.textContent), ['Notion', 'Linear']);
  assert.equal(box.querySelectorAll('.cs-group').length, 0, 'folded at first');
  assert.equal(box.querySelector('.cs-perm .cs-conn-status').textContent, '已連線');
  box.querySelector('[data-connector-id="linear"] .cs-fold-head').click();
  show();
  assert.equal(box.querySelectorAll('[data-connector-id="linear"] .cs-group').length, 2);
  assert.equal(box.querySelectorAll('[data-connector-id="notion"] .cs-group').length, 0);
  void nodes;
});

test('the picture of a connector is its logo, and its first letter takes its place when the picture cannot be loaded or there is none', async () => {
  const { connectorMark } = await import('../../src/app/ui/cli/connector-mark.js');
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  const linear = CONNECTORS.find((entry) => entry.id === 'linear');
  const mark = connectorMark(document, linear, { size: 30 });
  const image = mark.querySelector('img');
  assert.equal(image.getAttribute('src'), 'https://github.com/linear.png?size=96');
  assert.equal(image.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(image.getAttribute('alt'), '');
  image.dispatchEvent(new window.Event('error'));
  assert.equal(mark.querySelector('img'), null);
  assert.equal(mark.textContent, 'L');
  assert.equal(connectorMark(document, { name: 'Zed' }).textContent, 'Z');
  for (const connector of CONNECTORS) assert.match(connector.icon, /^https:\/\/github\.com\/[A-Za-z0-9-]+\.png\?size=\d+$/, connector.id);
});

test('the card that asks shows the logo of the connector', () => {
  const { document, cards } = cardSetup();
  cards.handle({ ...ASK, connector: { id: 'linear', name: 'Linear' }, tool: 'create_issue' });
  assert.equal(document.querySelector('.connector-ask-mark img').getAttribute('src'), 'https://github.com/linear.png?size=96');
});

test('the Permissions tab of the settings has a page for the connectors, with their permissions folded', async () => {
  const { renderPermissionsView } = await import('../../src/app/ui/cli/permissions-view.js');
  const t = setup({ connections: [LINEAR] });
  const root = t.document.createElement('div');
  t.document.body.append(root);
  const config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} };
  const options = { document: t.document, root, getLanguage: () => 'zh-TW', getConfig: () => config, credentials: { list: async () => ({ ok: true, credentials: [] }), save: async () => ({ ok: true }), remove: async () => ({ ok: true }) }, hasAccount: () => true };
  renderPermissionsView(options);
  const row = root.querySelector('.pm-row[data-view="connectors"]');
  assert.ok(row, 'a row for the connectors');
  assert.equal(row.querySelector('.pm-row-label').textContent, '連接器');
  row.click();
  await flush();
  await flush();
  await flush();
  assert.equal(root.querySelector('.pm-desc').textContent, '每個連接器的工具可以設為允許、每次詢問或拒絕。連線與中斷連線在「擴充」頁。');
  assert.equal(root.querySelector('.pm-sub').textContent, '連接器');
  assert.deepEqual([...root.querySelectorAll('.pm-connectors .cs-fold-title')].map((node) => node.textContent), ['Linear']);
  assert.equal(root.querySelectorAll('.pm-connectors .cs-group').length, 0, 'folded');
  root.querySelector('.pm-connectors .cs-fold-head').click();
  assert.equal(root.querySelectorAll('.pm-connectors .cs-group').length, 2, 'opened by the person');
  root.querySelectorAll('.pm-connectors .cs-group')[0].querySelectorAll('.cs-group-head .cs-seg-item')[1].click();
  await flush();
  assert.deepEqual(t.calls.at(-1), ['PUT', '/v1/connectors/linear/permissions', { tools: { list_issues: 'ask', get_issue: 'ask' } }]);
});

test('the page opened by its address before the account is known lists the connectors as soon as the account is ready (coming back from a service\'s login)', async () => {
  const { openCliStore, closeCliStore } = await import('../../src/app/ui/cli/cli-store.js');
  const window = new Window({ url: 'https://example.test/connectors?connector=linear&connected=1' });
  const { document } = window;
  document.body.innerHTML = '';
  registerServerRequest(async (method, path) => (method === 'GET' && path === '/v1/connectors'
    ? { ok: true, status: 200, data: { connectors: CONNECTORS.map((connector) => (connector.id === 'linear' ? { ...LINEAR } : { id: connector.id, status: 'none', mode: 'readwrite', tools: [], error: '' })) } }
    : { ok: false, status: 404, code: 'not_found', data: {} }));
  let ready = false;
  const notices = [];
  openCliStore({ document, kind: 'connectors', getConfig: () => ({ cliEnabledIds: [], cliModelUseIds: [], cliVersions: {} }), getLanguage: () => 'zh-TW', getAccountReady: () => ready, showNotification: (text, kind) => notices.push([text, kind]) });
  const root = document.querySelector('.cs');
  assert.deepEqual(notices.at(-1), ['已連線：Linear', 'success'], 'the result of the login is told at once');
  assert.equal(root.querySelector('.history-tab[aria-selected="true"]').textContent, '我的', 'a new connection is shown under Mine');
  assert.equal(root.querySelectorAll('.cs-conn').length, 0, 'the account is not known yet: nothing to list');
  ready = true;
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.equal(root.querySelectorAll('.cs-conn').length, 1, 'listed without the person switching pages');
  assert.equal(root.querySelector('.cs-conn-name').textContent, 'Linear');
  closeCliStore();
});

test('the style files of the connectors are well formed: every comment is closed (an open one swallows the rules after it), and the mark of a connector is rounded and sized', () => {
  const store = readFileSync(new URL('../../src/app/ui/cli/cli-store.css', import.meta.url), 'utf8');
  const ledger = readFileSync(new URL('../../src/styles/ledger.css', import.meta.url), 'utf8');
  for (const [name, css] of [['cli-store.css', store], ['ledger.css', ledger]]) {
    assert.equal(css.split('/*').length, css.split('*/').length, `${name}: as many comments opened as closed`);
    // No rule hides inside a comment: take the comments out and the rules of the marks are still there.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!bare.includes('/*') && !bare.includes('*/'), name);
  }
  const bare = store.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(bare, /\.cs-conn-mark \.connector-mark \{ width: 1\.9rem; height: 1\.9rem; border-radius: 0\.4rem; \}/);
  assert.match(bare, /\.cs-fold-mark \{[^}]*border-radius/);
  const logo = ledger.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(logo, /\.connector-mark-img \{[^}]*border-radius: inherit/);
});
