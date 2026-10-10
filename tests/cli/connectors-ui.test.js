import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { registerServerRequest } from '../../src/app/runtime/cli/cli-server-bridge.js';
import { CONNECTOR_TEXTS, connectorText } from '../../src/app/runtime/connector/connector-texts.js';
import { sandboxText } from '../../src/app/runtime/sandbox/sandbox-texts.js';
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
  const fakeWin = { location: { assign: (url) => assigned.push(url) }, history: { state: null, replaceState: (state, title, url) => replaced.push(url) } };
  const view = { tab: 'all', query: '' };
  const host = document.querySelector('.cs');
  let part = null;
  const draw = () => host.replaceChildren(...part.draw(view, { showMine: () => { view.tab = 'mine'; draw(); } }));
  part = createConnectorsPart({ document, win: fakeWin, t: (key, values) => connectorText(language, key, values), getLanguage: () => language, getAccountReady: () => account, redraw: draw, showNotification: (text, kind) => notices.push([text, kind]) });
  return { window, document, host, part, view, draw, calls, notices, assigned, replaced, data };
}
const settle = async (t) => { t.draw(); await flush(); await flush(); };
const names = (t, selector) => [...t.host.querySelectorAll(selector)].map((node) => node.textContent);

test('the list: the connectors are in their groups, each with its words, "Connected" or "Connect", and a search finds one', async () => {
  const t = setup();
  await settle(t);
  assert.deepEqual(names(t, '.cs-section-title'), ['筆記與專案']);
  assert.deepEqual(names(t, '.cs-name-text'), ['Notion', 'Linear']);
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
  // The words of the card in the step list, in the five languages too.
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['connectorCalling', 'connectorListing', 'connectorAskTitle', 'connectorAskOnce', 'connectorAskAlways', 'connectorAskDeny', 'connectorAskParams', 'connectorAskHideParams', 'connectorAskWait', 'connectorAnsweredOnce', 'connectorAnsweredAlways', 'connectorAnsweredDeny', 'connectorAnsweredTimeout', 'connectorAskFailed', 'connectorWaiting']) {
      assert.notEqual(sandboxText(language, key, { connector: 'C', tool: 'T', minutes: 10 }), key, `${language} ${key}`);
    }
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
  t.host.querySelector('[data-connector-id="linear"] .cs-text').click();
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
  t.host.querySelector('[data-connector-id="notion"] .cs-text').click();
  assert.equal(t.host.querySelector('.cs-dialog .cs-seg'), null);
  assert.match(t.host.querySelector('.cs-dialog').textContent, /授權包含寫入權限/);
});

test('a login that cannot begin says so and leaves the sheet to try again', async () => {
  const t = setup({ connections: [] });
  registerServerRequest(async (method, path) => (method === 'GET' ? { ok: true, status: 200, data: { connectors: [] } } : { ok: false, status: 502, code: 'internal_error', data: {} }));
  await settle(t);
  t.host.querySelector('[data-connector-id="notion"] .cs-text').click();
  t.host.querySelector('.cs-dialog .cs-button-primary').click();
  await flush();
  const error = t.host.querySelector('.cs-dialog-error');
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, '無法開始登入，請稍後再試。');
  assert.equal(t.host.querySelector('.cs-dialog .cs-button-primary').disabled, false);
  assert.deepEqual(t.assigned, []);
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
  assert.equal(document.querySelector('.connector-ask-mark').textContent, 'V');
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
