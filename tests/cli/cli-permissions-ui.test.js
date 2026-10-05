import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createNetAskCards } from '../../src/app/ui/sandbox/net-ask-card.js';
import { createSandboxLedger } from '../../src/app/ui/sandbox/sandbox-ledger.js';
import { invalidatePermissionsCredentials, renderPermissionsView, resetPermissionsView } from '../../src/app/ui/cli/permissions-view.js';
import { closeLicenses, openLicenses } from '../../src/app/ui/cli/licenses-view.js';
import { createNetAnswerHandler } from '../../src/app/runtime/cli/net-answer.js';
import { registerCliMode } from '../../src/app/runtime/cli/cli-bridge.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 15));
const page = () => {
  const window = new Window({ url: 'https://example.test/' });
  window.document.body.innerHTML = '<div id="host"></div>';
  return { window, document: window.document, host: window.document.getElementById('host') };
};

test('the card asks about a site with three answers, sends the one chosen, and turns into a line when the sandbox says it took it', async () => {
  const { document, host } = page();
  const answers = [];
  const cards = createNetAskCards({ document, host, language: 'en', onAnswer: async (answer) => { answers.push(answer); return { ok: true }; }, commandOf: () => 'twitter feed' });
  cards.handle({ type: 'net', event: 'ask', id: 'ask0000000000001', host: 'x.com', port: 443, waitMs: 600000 });
  cards.handle({ type: 'net', event: 'ask', id: 'ask0000000000001', host: 'x.com', port: 443 });
  assert.equal(host.querySelectorAll('.net-ask').length, 1, 'a question told again (a page that joined late) is one card');
  const card = host.querySelector('.net-ask');
  assert.match(card.querySelector('.net-ask-title').textContent, /wants to connect to x\.com/);
  assert.equal(card.querySelector('.net-ask-command').textContent, 'twitter feed');
  assert.deepEqual([...card.querySelectorAll('.net-ask-button')].map((button) => button.textContent), ['Allow this time', 'Always allow', 'Refuse']);
  assert.match(card.querySelector('.net-ask-note').textContent, /10 minutes/);
  assert.equal(cards.open, 1);

  card.querySelectorAll('.net-ask-button')[1].click();
  await flush();
  assert.deepEqual(answers, [{ id: 'ask0000000000001', decision: 'always', host: 'x.com' }]);
  assert.equal(card.classList.contains('is-resolved'), false, 'it is shown as answered when the sandbox says so');
  cards.handle({ type: 'net', event: 'answer', id: 'ask0000000000001', decision: 'always' });
  assert.equal(card.classList.contains('is-resolved'), true);
  assert.equal(card.querySelector('.net-ask-title').textContent, 'Always allowed: x.com');
  assert.equal(card.querySelector('.net-ask-actions'), null);
  assert.equal(cards.open, 0);
});

test('a refused answer and a missing one are shown as refused; an answer that could not be sent can be given again', async () => {
  const { document, host } = page();
  let works = false;
  const cards = createNetAskCards({ document, host, language: 'zh-TW', onAnswer: async () => ({ ok: works }) });
  cards.handle({ event: 'ask', id: 'ask0000000000002', host: 'a.example', port: 443 });
  cards.handle({ event: 'ask', id: 'ask0000000000003', host: 'b.example', port: 80 });
  const [first, second] = host.querySelectorAll('.net-ask');
  assert.equal(first.querySelector('.net-ask-title').textContent, '命令工具想連到 a.example');
  first.querySelectorAll('.net-ask-button')[2].click();
  await flush();
  assert.equal(first.querySelector('.net-ask-failed').hidden, false, 'the answer was not sent: it says so');
  assert.ok([...first.querySelectorAll('.net-ask-button')].every((button) => !button.disabled), 'and may be given again');
  cards.handle({ event: 'answer', id: 'ask0000000000002', decision: 'deny' });
  assert.equal(first.querySelector('.net-ask-title').textContent, '已拒絕：a.example');
  assert.equal(first.classList.contains('is-refused'), true);
  cards.handle({ event: 'answer', id: 'ask0000000000003', decision: 'timeout' });
  assert.equal(second.querySelector('.net-ask-title').textContent, '沒有及時回答，已拒絕：b.example');
  cards.handle({ event: 'answer', id: 'unknown', decision: 'once' });
});

test('the step list shows the card at the step that asked, with its command, and the answer goes through the page\'s handler', async () => {
  const { document, host } = page();
  const answers = [];
  const ledger = createSandboxLedger({ document, host, language: 'en', onNetAnswer: async (answer) => { answers.push(answer.decision); return { ok: true }; } });
  ledger.event({ type: 'round', label: 'Thinking', doneLabel: 'Thought' });
  ledger.event({ type: 'step', n: 1, title: 'Read the feed', code: 'twitter feed --max 5', command: true });
  ledger.event({ type: 'net', event: 'ask', id: 'ask0000000000004', host: 'x.com', port: 443, waitMs: 600000 });
  const card = host.querySelector('.net-ask');
  assert.ok(card, 'the card is in the step list');
  assert.equal(card.querySelector('.net-ask-command').textContent, 'twitter feed --max 5');
  card.querySelector('.net-ask-button.is-primary').click();
  await flush();
  assert.deepEqual(answers, ['once']);
  ledger.event({ type: 'net', event: 'answer', id: 'ask0000000000004', decision: 'once' });
  assert.equal(card.querySelector('.net-ask-title').textContent, 'Allowed this time: x.com');
  ledger.remove();
});

test('the answer goes to the reply that is running, and what lasts of it is kept in the settings', async () => {
  const kept = [];
  registerCliMode({ rememberNet: async (host, decision) => { kept.push([host, decision]); } });
  const sent = [];
  const handler = createNetAnswerHandler({ getRun: () => ({ answerNet: async (id, decision) => { sent.push([id, decision]); return { ok: true }; } }) });
  assert.deepEqual(await handler({ id: 'ask0000000000005', decision: 'always', host: 'x.com' }), { ok: true });
  assert.deepEqual(sent, [['ask0000000000005', 'always']]);
  assert.deepEqual(kept, [['x.com', 'always']]);
  // Not sent (the server did not take it): nothing is kept, and the card may be answered again.
  const failing = createNetAnswerHandler({ getRun: () => ({ answerNet: async () => ({ ok: false }) }) });
  assert.deepEqual(await failing({ id: 'ask0000000000006', decision: 'deny', host: 'y.com' }), { ok: false });
  assert.equal(kept.length, 1);
  assert.deepEqual(await createNetAnswerHandler({ getRun: () => null })({ id: 'a', decision: 'once', host: 'z.com' }), { ok: false });
  registerCliMode(null);
});

// ----- the Permissions tab

function permissions({ config = { cliEnabledIds: [], cliModelUseIds: [], cliVersions: {}, netMode: 'new', netRules: {} }, language = 'en', account = true, credentialItems = [] } = {}) {
  const { window, document, host } = page();
  const log = { saved: 0, notices: [], store: 0, licenses: 0, calls: [] };
  const items = [...credentialItems];
  const credentials = {
    list: async () => (account ? { ok: true, credentials: items.map((item) => ({ ...item })) } : { ok: false, code: 'unavailable' }),
    save: async (name, value) => {
      log.calls.push(['save', name, value]);
      if (name === 'BAD_VALUE') return { ok: false, code: 'bad_request', reason: 'bad_value' };
      const at = items.findIndex((item) => item.name === name);
      if (at >= 0) items[at] = { name, value }; else items.push({ name, value });
      return { ok: true };
    },
    remove: async (name) => { log.calls.push(['remove', name]); items.splice(items.findIndex((item) => item.name === name), 1); return { ok: true }; }
  };
  const draw = () => renderPermissionsView({
    document, root: host, getLanguage: () => language, getConfig: () => config, saveConfig: async () => { log.saved += 1; }, credentials,
    hasAccount: () => account, openStore: () => { log.store += 1; }, openLicenses: () => { log.licenses += 1; }, showNotification: (text, kind) => log.notices.push([text, kind])
  });
  draw();
  const row = (view) => host.querySelector(`.pm-row[data-view="${view}"]`);
  return { window, document, host, config, log, draw, row, items };
}

test('the tab opens with the default for the network and the three things to manage, each with its count', async () => {
  const t = permissions({ config: { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: [], cliVersions: {}, netMode: 'new', netRules: { 'x.com': 'deny' } }, credentialItems: [{ name: 'A_B', value: 'v' }] });
  await flush();
  assert.equal(t.host.querySelector('.pm-sub').textContent, 'Network access defaults');
  const radios = [...t.host.querySelectorAll('input[name="cli-net-mode"]')];
  assert.deepEqual(radios.map((radio) => [radio.value, radio.checked]), [['new', true], ['always', false]]);
  assert.deepEqual([...t.host.querySelectorAll('.pm-row')].map((row) => [row.querySelector('.pm-row-label').textContent, row.querySelector('.pm-count').textContent]), [['CLI tools', '2'], ['Sites', '7'], ['Secure credentials', '1']]);
  radios[1].checked = true;
  radios[1].dispatchEvent(new t.window.Event('change', { bubbles: true }));
  assert.equal(t.config.netMode, 'always');
  await flush();
  assert.equal(t.log.saved, 1, 'saved at once');
  assert.equal(t.host.querySelector('input[value="always"]').checked, true);
  t.host.querySelector('.pm-link').click();
  assert.equal(t.log.licenses, 1);
});

test('the CLI tools: one row each with the switch "let the model use it by itself", off at first', async () => {
  const t = permissions({ config: { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: [], cliVersions: {}, netMode: 'new', netRules: {} } });
  t.row('tools').click();
  const switches = () => [...t.host.querySelectorAll('.pm-switch .toggle-checkbox')];
  assert.ok(t.host.querySelector('.pm-switch .toggle-label'), 'the same switch as the other settings');
  assert.deepEqual(switches().map((toggle) => toggle.checked), [false, false]);
  assert.match(t.host.querySelector('.pm-desc').textContent, /only when you choose it with @/);
  const second = switches()[1];
  second.click();
  assert.equal(switches()[1], second, 'it slides where it is (a new switch would show no motion): the page is not drawn again');
  assert.deepEqual(t.config.cliModelUseIds, ['ffmpeg']);
  assert.deepEqual(switches().map((toggle) => toggle.checked), [false, true]);
  await flush();
  assert.equal(t.log.saved, 1);
  t.host.querySelector('.pm-back').click();
  assert.ok(t.host.querySelector('input[name="cli-net-mode"]'), 'back to the first page');
  // With no tool added the tab says so and leads to the store.
  const none = permissions();
  none.row('tools').click();
  assert.equal(none.host.querySelector('.pm-empty').textContent, 'No CLI tools added yet.');
  none.host.querySelector('.pm-button').click();
  assert.equal(none.log.store, 1);
});

test('the sites: the ones allowed at first are there, a rule is changed from a menu, a site is added and removed, and a bad name is refused', async () => {
  const t = permissions();
  t.row('sites').click();
  const hosts = () => [...t.host.querySelectorAll('.pm-row[data-host]')].map((row) => [row.dataset.host, row.querySelector('.pm-rule span').textContent]);
  assert.deepEqual(hosts().slice(0, 2), [['pypi.org', 'Allow'], ['files.pythonhosted.org', 'Allow']]);
  assert.equal(hosts().length, 6);

  // The menu of a site's rule (it is in the page's body).
  t.host.querySelector('.pm-row[data-host="github.com"] .pm-rule').click();
  const menu = t.document.querySelector('.pm-menu');
  assert.deepEqual([...menu.querySelectorAll('.pm-menu-item')].map((item) => item.textContent.trim()), ['Allow', 'Ask', 'Refuse']);
  [...menu.querySelectorAll('.pm-menu-item')][2].click();
  assert.deepEqual(t.config.netRules, { 'github.com': 'deny' });
  assert.equal(t.document.querySelector('.pm-menu'), null, 'the menu closes');
  assert.equal(hosts().find(([host]) => host === 'github.com')[1], 'Refuse');
  // A default site that was changed can go back.
  t.host.querySelector('.pm-row[data-host="github.com"] .pm-rule').click();
  const reset = [...t.document.querySelectorAll('.pm-menu-item')].find((item) => /Restore the default/.test(item.textContent));
  reset.click();
  assert.deepEqual(t.config.netRules, {});

  const add = (value) => {
    t.host.querySelector('.pm-add .pm-input').value = value;
    t.host.querySelector('.pm-add').dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  };
  add('not a site');
  assert.equal(t.host.querySelector('.pm-error').hidden, false);
  assert.deepEqual(t.config.netRules, {});
  add('Example.COM');
  assert.deepEqual(t.config.netRules, { 'example.com': 'allow' });
  assert.deepEqual(hosts().at(-1), ['example.com', 'Allow']);
  t.host.querySelector('.pm-row[data-host="example.com"] .pm-rule').click();
  [...t.document.querySelectorAll('.pm-menu-item')].find((item) => /Remove from the list/.test(item.textContent)).click();
  assert.deepEqual(t.config.netRules, {});
  await flush();
  assert.ok(t.log.saved >= 3, 'every change is saved');
});

test('the secure credentials: listed hidden, shown on request, replaced, deleted after a second tap, added; no preset list, known ones named by their kind', async () => {
  const t = permissions({ config: { cliEnabledIds: ['twitter-cli'], cliModelUseIds: [], cliVersions: {}, netMode: 'new', netRules: {} }, credentialItems: [{ name: 'TWITTER_CT0', value: 'secret-ct0-value' }] });
  await flush();
  t.row('credentials').click();
  await flush();
  const cred = (name) => t.host.querySelector(`.pm-cred[data-name="${name}"]`);
  assert.equal(cred('TWITTER_CT0').querySelector('.pm-cred-value').textContent, '••••••••••••');
  assert.ok(!t.host.textContent.includes('secret-ct0-value'), 'the value is not on the page until it is shown');
  const chip = (name, label) => [...cred(name).querySelectorAll('.pm-chip')].find((entry) => entry.textContent === label);
  chip('TWITTER_CT0', 'Show').click();
  assert.equal(cred('TWITTER_CT0').querySelector('.pm-cred-value').textContent, 'secret-ct0-value');
  chip('TWITTER_CT0', 'Hide').click();
  assert.equal(cred('TWITTER_CT0').querySelector('.pm-cred-value').textContent, '••••••••••••');

  // No preset list of what the tools need: a login is asked for in a window when a tool needs it. A known credential is named by what it is.
  assert.doesNotMatch(t.host.textContent, /Your CLI tools need/);
  assert.equal(cred('TWITTER_AUTH_TOKEN'), null);
  assert.match(cred('TWITTER_CT0').querySelector('.pm-row-label').textContent, /^twitter-cli · Cookie$/);
  assert.equal(cred('TWITTER_CT0').querySelector('.pm-row-desc').textContent, 'ct0');

  // One added by hand (a login of any name), saved.
  [...t.host.querySelectorAll('.pm-button')].find((button) => button.textContent === 'Add a secure credential').click();
  const form = t.host.querySelector('.pm-form');
  form.querySelector('input[type="text"]').value = 'TWITTER_AUTH_TOKEN';
  form.querySelector('input[type="password"]').value = 'new-token';
  form.dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.deepEqual(t.log.calls.at(-1), ['save', 'TWITTER_AUTH_TOKEN', 'new-token']);
  assert.ok(cred('TWITTER_AUTH_TOKEN'), 'now in the list');
  assert.deepEqual(t.log.notices.at(-1), ['Saved “TWITTER_AUTH_TOKEN”.', 'success']);

  // Replaced, and a value the server refuses says why.
  chip('TWITTER_CT0', 'Replace').click();
  let replaceForm = cred('TWITTER_CT0').querySelector('.pm-form');
  replaceForm.querySelector('input[type="password"]').value = 'replaced';
  replaceForm.dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.deepEqual(t.log.calls.at(-1), ['save', 'TWITTER_CT0', 'replaced']);

  // Deleted only after a second tap.
  chip('TWITTER_CT0', 'Delete').click();
  assert.equal(t.items.some((item) => item.name === 'TWITTER_CT0'), true, 'not yet');
  chip('TWITTER_CT0', 'Delete it?').click();
  await flush();
  assert.equal(t.items.some((item) => item.name === 'TWITTER_CT0'), false);

  // One of any name.
  [...t.host.querySelectorAll('.pm-button')].find((button) => button.textContent === 'Add a secure credential').click();
  const adding = t.host.querySelector('.pm-form');
  adding.querySelector('input[type="text"]').value = 'lower case';
  adding.querySelector('input[type="password"]').value = 'v';
  adding.dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.match(t.host.querySelector('.pm-form .pm-error').textContent, /capital letters, digits and underscores/);
  adding.querySelector('input[type="text"]').value = 'BAD_VALUE';
  adding.dispatchEvent(new t.window.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.match(t.host.querySelector('.pm-form .pm-error').textContent, /cannot be empty/);
});

test('without a cloud account the credentials say they need one; the tab is in the person\'s language', async () => {
  const t = permissions({ account: false, language: 'fr' });
  await flush();
  assert.equal(t.host.querySelector('.pm-sub').textContent, 'Accès réseau par défaut');
  t.row('credentials').click();
  assert.match(t.host.querySelector('.pm-empty').textContent, /connectez-vous d’abord à un compte cloud/);
  resetPermissionsView(t.host);
  t.draw();
  assert.ok(t.host.querySelector('input[name="cli-net-mode"]'), 'opened again at the first page');
});

test('the page of third-party software lists the tools of the store, the sandbox and the libraries, and closes with its back button or Escape', () => {
  const { window, document } = page();
  const opened = openLicenses({ document, getLanguage: () => 'en' });
  assert.equal(openLicenses({ document, getLanguage: () => 'en' }), opened, 'once');
  const root = document.querySelector('.pm-lic');
  assert.equal(root.querySelector('.pm-lic-title').textContent, 'Third-party software and licences');
  const sections = [...root.querySelectorAll('.pm-lic-section')].map((node) => node.textContent);
  assert.deepEqual(sections, ['CLI tools', 'Software in the server sandbox', 'Libraries Noureon uses']);
  const names = [...root.querySelectorAll('.pm-lic-name')].map((node) => node.textContent);
  for (const wanted of ['OfficeCLI 1.0.153', 'FFmpeg 7.0.2', 'yt-dlp 2026.08.19', 'Python', 'Pyodide']) assert.ok(names.includes(wanted), wanted);
  assert.ok([...root.querySelectorAll('.pm-lic-license')].some((node) => node.textContent === 'GPL-3.0-or-later'), 'the licence of FFmpeg');
  assert.ok([...root.querySelectorAll('a.pm-lic-name')].every((link) => link.rel === 'noopener noreferrer' && link.target === '_blank'));
  root.querySelector('.pm-lic-back').click();
  assert.equal(document.querySelector('.pm-lic'), null);
  openLicenses({ document, getLanguage: () => 'zh-TW' });
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('.pm-lic'), null, 'Escape closes it');
  closeLicenses();
});

test('a credential saved elsewhere (the window in a chat) shows in the open tab, and the list is read again each time the settings open', async () => {
  const t = permissions({ credentialItems: [] });
  await flush();
  t.row('credentials').click();
  await flush();
  assert.match(t.host.textContent, /No secure credentials yet/);
  // Saved from the window in a chat: the tab is told, and draws the new list at once.
  t.items.push({ name: 'TWITTER_CT0', value: 'v' });
  invalidatePermissionsCredentials(t.host);
  t.draw();
  await flush();
  assert.ok(t.host.querySelector('.pm-cred[data-name="TWITTER_CT0"]'));
  // Opened again later: read again, not the list it had.
  t.items.push({ name: 'REDDIT_SESSION', value: 'w' });
  resetPermissionsView(t.host);
  t.draw();
  await flush();
  t.row('credentials').click();
  await flush();
  assert.ok(t.host.querySelector('.pm-cred[data-name="REDDIT_SESSION"]'));
});

test('the tab can be gone back through one page at a time (the arrow at the top of a phone\'s settings page does it), and says when it is on its first page', async () => {
  const { goBackInPermissionsView } = await import('../../src/app/ui/cli/permissions-view.js');
  const t = permissions({ config: { cliEnabledIds: ['ffmpeg'], cliModelUseIds: [], cliVersions: {}, netMode: 'new', netRules: {} } });
  assert.equal(goBackInPermissionsView(t.host), false, 'already on the first page: the arrow leaves the tab');
  for (const view of ['tools', 'sites', 'credentials']) {
    t.row(view).click();
    assert.ok(!t.host.querySelector('input[name="cli-net-mode"]'), `${view} is a page of its own`);
    assert.equal(goBackInPermissionsView(t.host), true);
    assert.ok(t.host.querySelector('input[name="cli-net-mode"]'), `back on the first page from ${view}`);
    assert.equal(goBackInPermissionsView(t.host), false);
  }
  assert.equal(goBackInPermissionsView({}), false, 'a page that was never drawn');
});
