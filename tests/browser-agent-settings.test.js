// The settings tab of the browser agent: asks for a code when the person has none, lists the vault with each site's own icon (a globe when it has none), keeps the login state, and holds no password.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountBrowserAgentSection, formatSize } from '../src/app/ui/browser-agent/browser-agent-settings.js';
import { PENDING_INVITE_KEY } from '../src/app/runtime/browser-agent/browser-invite-link.js';
import browserAgentTexts from '../src/data/i18n/parts/browser-agent.js';

const texts = browserAgentTexts.en;
const text = (key) => texts[key] ?? key;
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function page() {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="settings-modal"><ul id="settings-nav"><li data-section="tool-models" class="settings-nav-item"></li></ul><div id="tool-models-section" class="settings-section"></div></div>';
  return { window, document };
}
function fakeClient(over = {}) {
  const calls = [];
  const client = {
    calls,
    getAccess: async () => ({ ok: true, allowed: true, admin: false, codes: [{ code: 'NRN-AAAA-BBBB', used: false }, { code: 'NRN-CCCC-DDDD', used: true }] }),
    listLogins: async () => ({ ok: true, logins: [{ id: 'l1', name: 'Shop', origins: ['https://shop.example'] }] }),
    getProfile: async () => ({ ok: true, exists: true, sizeBytes: 1_300_000, lastUsedAt: '2026-11-16T10:00:00Z' }),
    redeemCode: async (code) => { calls.push(['redeem', code]); return code === 'bad' ? { ok: false, message: 'That code cannot be used.' } : { ok: true }; },
    deleteLogin: async (id) => { calls.push(['deleteLogin', id]); return { ok: true }; },
    logoutSite: async (origin) => { calls.push(['logout', origin]); return { ok: true }; },
    deleteProfile: async () => { calls.push(['deleteProfile']); return { ok: true }; },
    ...over
  };
  return client;
}
// The accounts are a page of their own: the first page has a row that opens it.
const openAccounts = async (document) => { document.querySelector('#browser-agent-section .ba-row-link').click(); await tick(); return document.getElementById('browser-agent-section'); };
const config = (value = {}) => { const state = { ...value }; return { state, configAccess: { getConfig: () => state, mutateConfig: (patch) => Object.assign(state, patch) } }; };

test('the tab is added after the tool models, with its words', async () => {
  const { document } = page();
  const section = mountBrowserAgentSection({ document, text, client: fakeClient() });
  await tick();
  assert.equal(document.getElementById('browser-agent-section-nav').dataset.section, 'browser-agent');
  assert.equal(document.getElementById('tool-models-section').nextElementSibling.id, 'browser-agent-section');
  assert.equal(document.getElementById('browser-agent-section').dataset.sectionTitle, 'Browser agent');
  assert.ok(section.refresh);
  assert.equal(mountBrowserAgentSection({ document: new Window().document, text, client: fakeClient() }), null, 'a page with no list of settings gets nothing');
});

test('a person with no access sees the invite field; a wrong code is said in plain words, a good one draws the tab again', async () => {
  const { document } = page();
  let allowed = false;
  const client = fakeClient({ getAccess: async () => ({ ok: true, allowed, admin: false, codes: [] }) });
  mountBrowserAgentSection({ document, text, client });
  await tick();
  const root = document.getElementById('browser-agent-section');
  assert.match(root.textContent, /An invite code is needed/);
  assert.equal(root.querySelector('.ba-card .ba-row .ba-title').textContent, 'An invite code is needed');
  assert.ok(!root.textContent.includes('Connected site accounts'));
  const input = root.querySelector('.ba-code');
  input.value = 'bad';
  root.querySelector('.ba-btn.is-primary').click();
  await tick();
  assert.match(document.getElementById('browser-agent-section').textContent, /That code cannot be used/);
  allowed = true;
  const field = document.getElementById('browser-agent-section').querySelector('.ba-code');
  field.value = 'NRN-AAAA-BBBB';
  document.getElementById('browser-agent-section').querySelector('.ba-btn.is-primary').click();
  await tick(); await tick();
  assert.deepEqual(client.calls.map((c) => c[1]), ['bad', 'NRN-AAAA-BBBB']);
  assert.match(document.getElementById('browser-agent-section').textContent, /Connected site accounts/);
});

test('each login shows its site icon, and a globe when the icon cannot be loaded; no password is on the page', async () => {
  const { document } = page();
  mountBrowserAgentSection({ document, text, client: fakeClient({ listLogins: async () => ({ ok: true, logins: [{ id: 'l1', name: 'Shop', origins: ['https://shop.example'] }, { id: 'l2', name: 'Odd', origins: ['not a url'] }] }) }) });
  await tick();
  const root = await openAccounts(document);
  const image = root.querySelector('.ba-mark img');
  assert.equal(image.getAttribute('src'), 'https://shop.example/favicon.ico', 'asked of the site itself, nobody else');
  assert.equal(image.referrerPolicy, 'no-referrer');
  image.dispatchEvent(new document.defaultView.Event('error'));
  assert.equal(image.getAttribute('src'), 'https://shop.example/apple-touch-icon.png', 'the other place the site keeps its icon is tried before a globe');
  image.dispatchEvent(new document.defaultView.Event('error'));
  assert.ok(!root.querySelector('.ba-mark img'), 'the icon that failed twice became a globe');
  assert.ok(root.querySelector('.ba-mark svg circle'));
  const rows = [...root.querySelectorAll('.ba-row')].filter((row) => row.textContent.includes('Vault'));
  assert.equal(rows.length, 2);
  assert.ok(!/password\s*[:=]/i.test(root.innerHTML));
});

test('delete password and log out of a site are in the ⋯ menu; the delete is done by one press and says nothing about what was deleted', async () => {
  const { document } = page();
  const client = fakeClient();
  mountBrowserAgentSection({ document, text, client });
  await tick();
  let root = await openAccounts(document);
  const items = [...root.querySelectorAll('.ba-menu-item')];
  assert.deepEqual(items.map((i) => i.textContent), ['Log out of this site', 'Delete password']);
  items[0].click();
  await tick();
  assert.deepEqual(client.calls.at(-1), ['logout', 'https://shop.example']);
  root = document.getElementById('browser-agent-section');
  root.querySelectorAll('.ba-menu-item')[1].click();
  await tick();
  assert.deepEqual(client.calls.at(-1), ['deleteLogin', 'l1'], 'one press deletes');
  root = document.getElementById('browser-agent-section');
  assert.ok(!/deleted/i.test(root.querySelector('.ba-notice')?.textContent || ''), 'no line about the deleted login');
});

test('the icon of a site is made once and kept when the tab is drawn again (it did not flash), and a globe that replaced a failed icon stays a globe', async () => {
  const { document } = page();
  const client = fakeClient();
  const section = mountBrowserAgentSection({ document, text, client });
  await tick();
  let root = await openAccounts(document);
  const image = root.querySelector('.ba-mark img');
  assert.ok(image);
  await section.refresh();
  await tick();
  root = document.getElementById('browser-agent-section');
  assert.equal(root.querySelector('.ba-mark img'), image, 'the same picture, not a new one that has to load again');
  image.dispatchEvent(new document.defaultView.Event('error'));
  image.dispatchEvent(new document.defaultView.Event('error'));
  await section.refresh();
  await tick();
  root = document.getElementById('browser-agent-section');
  assert.ok(!root.querySelector('.ba-mark img'), 'not tried again');
  assert.ok(root.querySelector('.ba-mark svg circle'));
});

test('the connected accounts are not listed on the first page: a row with their number opens the list, which has a way back; every row has a mark in front', async () => {
  const { document } = page();
  mountBrowserAgentSection({ document, text, client: fakeClient() });
  await tick();
  let root = document.getElementById('browser-agent-section');
  assert.ok(!root.querySelector('.ba-menu'), 'no account is listed on the first page');
  const entry = root.querySelector('.ba-row-link');
  assert.match(entry.textContent, /1 sites/);
  for (const row of root.querySelectorAll('.ba-row')) assert.ok(row.querySelector('.ba-mark svg, .ba-mark img'), `a mark in front of: ${row.textContent.slice(0, 30)}`);
  root = await openAccounts(document);
  assert.ok(root.querySelector('.ba-menu'), 'the list is on its own page');
  assert.ok(!root.querySelector('.ba-switch'), 'the first page is gone');
  root.querySelector('.ba-back').click();
  await tick();
  root = document.getElementById('browser-agent-section');
  assert.ok(root.querySelector('.ba-switch') && !root.querySelector('.ba-menu'), 'the way back returns to the first page');
});

test('stay logged in is a setting that is saved; the login state can be deleted after a second press', async () => {
  const { document } = page();
  const client = fakeClient();
  const { state, configAccess } = config({ browserKeepLogin: true });
  let saved = 0;
  mountBrowserAgentSection({ document, text, client, configAccess, saveConfig: async () => { saved += 1; } });
  await tick();
  let root = document.getElementById('browser-agent-section');
  const toggle = root.querySelector('.ba-switch');
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
  toggle.click();
  await tick();
  assert.equal(state.browserKeepLogin, false);
  assert.equal(saved, 1);
  assert.match(root.textContent, /1\.2 MB/, 'the row of the login state says its size and when it was used');
  assert.ok(!/deleted/i.test(root.querySelector('.ba-notice')?.textContent || ''));
  const wipe = root.querySelector('.ba-btn.is-danger');
  wipe.click();
  await tick();
  assert.ok(!client.calls.some((c) => c[0] === 'deleteProfile'));
  root = document.getElementById('browser-agent-section');
  root.querySelector('.ba-btn.is-danger, .ba-btn.is-confirming').click();
  await tick();
  assert.deepEqual(client.calls.at(-1), ['deleteProfile']);
  assert.equal(document.querySelector('#browser-agent-section .ba-notice'), null, 'no line that says the login state was deleted');
});

test('the person\'s own codes are listed, the unused one can be copied; there is nothing for the people in charge here', async () => {
  const { document } = page();
  mountBrowserAgentSection({ document, text, client: fakeClient({ getAccess: async () => ({ ok: true, allowed: true, admin: true, codes: [{ code: 'NRN-AAAA-BBBB', used: false }, { code: 'NRN-CCCC-DDDD', used: true }] }) }) });
  await tick();
  const root = document.getElementById('browser-agent-section');
  const rows = [...root.querySelectorAll('.ba-code-text')].map((n) => n.textContent);
  assert.deepEqual(rows, ['NRN-AAAA-BBBB', 'NRN-CCCC-DDDD']);
  const copyButtons = [...root.querySelectorAll('.ba-btn')].filter((b) => b.textContent === 'Copy');
  assert.equal(copyButtons.length, 2);
  assert.deepEqual(copyButtons.map((b) => b.hidden), [false, true]);
  assert.ok(!/Stop all|admin/i.test(root.textContent));
});

test('a server that cannot be reached says so; sizes read plainly', async () => {
  const { document } = page();
  mountBrowserAgentSection({ document, text, client: fakeClient({ getAccess: async () => ({ ok: false, code: 'unavailable' }) }) });
  await tick();
  assert.match(document.getElementById('browser-agent-section').textContent, /cannot be reached/);
  assert.equal(formatSize(512), '1 KB');
  assert.equal(formatSize(2 * 1024 * 1024), '2.0 MB');
});

test('each code that is not used has a link to copy', async () => {
  const { window, document } = page();
  let copied = '';
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (value) => { copied = value; } }, configurable: true });
  mountBrowserAgentSection({ document, text, client: fakeClient() });
  await tick();
  const buttons = [...document.querySelectorAll('#browser-agent-section .ba-btn')].filter((button) => button.textContent === texts.baCopyLink);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].hidden, false);
  assert.equal(buttons[1].hidden, true, 'a code that is used has no link to give');
  buttons[0].click();
  await tick();
  assert.equal(copied, 'https://noureon.test/#browser-invite=NRN-AAAA-BBBB');
  assert.equal(buttons[0].textContent, texts.baCopied);
  assert.equal(buttons[0].dataset.reserve, texts.baCopied, 'the button keeps the room of the longer words, so it does not move');
  await new Promise((resolve) => setTimeout(resolve, 1700));
  assert.equal(buttons[0].textContent, texts.baCopyLink, 'the words come back');
});

test('a code that came with a link waits in the box, and is not used until the button is pressed', async () => {
  const { window, document } = page();
  window.localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code: 'NRN-EEEE-FFFF', at: Date.now() }));
  const client = fakeClient({ getAccess: async () => ({ ok: true, allowed: false, admin: false, codes: [] }) });
  mountBrowserAgentSection({ document, text, client });
  await tick();
  const input = document.querySelector('#browser-agent-section input.ba-code');
  assert.equal(input.value, 'NRN-EEEE-FFFF');
  assert.ok(document.getElementById('browser-agent-section').textContent.includes(texts.baRedeemFromLink));
  assert.deepEqual(client.calls, [], 'nothing is redeemed by itself');
  [...document.querySelectorAll('#browser-agent-section .ba-btn')].find((button) => button.textContent === texts.baRedeem).click();
  await tick();
  assert.deepEqual(client.calls, [['redeem', 'NRN-EEEE-FFFF']]);
  assert.equal(window.localStorage.getItem(PENDING_INVITE_KEY), null);
});

test('a person who can already use the browser agent is told the code was not used', async () => {
  const { window, document } = page();
  window.localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ code: 'NRN-EEEE-FFFF', at: Date.now() }));
  const client = fakeClient();
  mountBrowserAgentSection({ document, text, client });
  await tick();
  assert.ok(document.getElementById('browser-agent-section').textContent.includes(texts.baRedeemAlready));
  assert.equal(window.localStorage.getItem(PENDING_INVITE_KEY), null);
  assert.deepEqual(client.calls, []);
});

test('the five languages have the same words', () => {
  const keys = Object.keys(browserAgentTexts['zh-TW']).sort();
  for (const language of ['en', 'fr', 'ru', 'es']) assert.deepEqual(Object.keys(browserAgentTexts[language]).sort(), keys, language);
});
