import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createCredentialAnswerHandler } from '../../src/app/runtime/cli/credential-answer.js';
import { PERMISSION_TEXTS } from '../../src/app/runtime/cli/permission-texts.js';
import { sandboxText } from '../../src/app/runtime/sandbox/sandbox-texts.js';
import { createCredentialAskCards } from '../../src/app/ui/sandbox/credential-ask-card.js';
import { openCredentialModal } from '../../src/app/ui/cli/credential-modal.js';
import { cliCredentialInfo, CREDENTIAL_TYPES, OFFICIAL_CLI_CATALOG } from '../../src/data/cli-catalog.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const page = () => {
  const window = new Window({ url: 'https://example.test/' });
  return { window, document: window.document };
};
const TWITTER = { id: 'twitter-cli', name: 'twitter-cli' };
const TWITTER_FIELDS = [
  { env: 'TWITTER_AUTH_TOKEN', label: 'auth_token', type: 'token', site: 'x.com' },
  { env: 'TWITTER_CT0', label: 'ct0', type: 'cookie', site: 'x.com' }
];

test('the catalog says what each credential is, so nothing is asked for as "a password" by default', () => {
  for (const tool of OFFICIAL_CLI_CATALOG) {
    for (const credential of tool.credentials || []) {
      assert.ok(CREDENTIAL_TYPES.includes(credential.type), `${credential.env} has a type`);
      assert.ok(credential.site, `${credential.env} has a site`);
    }
  }
  assert.equal(cliCredentialInfo('TWITTER_AUTH_TOKEN').type, 'token');
  assert.equal(cliCredentialInfo('TWITTER_CT0').type, 'cookie');
  assert.equal(cliCredentialInfo('REDDIT_SESSION').type, 'cookie');
  assert.equal(cliCredentialInfo('SOMETHING_ELSE'), null);
});

test('every language has the words of the window and of the card, and a line on where to find each login', () => {
  const keys = ['credTypeToken', 'credTypeCookie', 'credTypePassword', 'credModalTitle', 'credModalDesc', 'credModalSkip', 'credModalSave', 'credModalRequired', 'credHow_TWITTER_AUTH_TOKEN', 'credHow_TWITTER_CT0', 'credHow_REDDIT_SESSION', 'credHowGeneric', 'credKnownTool'];
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of keys) assert.ok(PERMISSION_TEXTS[language][key], `${language} ${key}`);
    for (const key of ['credAskTitle', 'credAskEnter', 'credAskSkip', 'credAskWait', 'credAnsweredSaved', 'credAnsweredCancel', 'credAnsweredTimeout', 'sandboxCredentialWaiting']) assert.ok(sandboxText(language, key, { tool: 'x', minutes: 1 }) !== key, `${language} ${key}`);
  }
});

test('the window names each field by what it is, with where to find it, shows and hides, and saves what is typed', async () => {
  const { document } = page();
  const submitted = [];
  const modal = openCredentialModal({ document, language: 'en', tool: TWITTER, fields: TWITTER_FIELDS, onSubmit: async (values) => { submitted.push(values); return { ok: true }; } });
  const dialog = document.querySelector('.cred-modal-dialog');
  assert.equal(dialog.querySelector('.cred-modal-title').textContent, 'twitter-cli needs your login');
  assert.equal(dialog.querySelector('.cred-modal-site').textContent, 'twitter-cli · x.com');
  const labels = [...dialog.querySelectorAll('.cred-modal-label')].map((label) => [label.querySelector('.cred-modal-type').textContent, label.querySelector('.cred-modal-name').textContent]);
  assert.deepEqual(labels, [['Token', 'auth_token'], ['Cookie', 'ct0']]);
  assert.match(dialog.querySelectorAll('.cred-modal-how')[0].textContent, /auth_token/);
  assert.ok(![...dialog.querySelectorAll('input[type="checkbox"]')].length, 'there is no "save?" box: it is always saved');
  const [token, ct0] = dialog.querySelectorAll('.cred-modal-text');
  assert.equal(token.type, 'password');
  dialog.querySelectorAll('.cred-modal-eye')[0].click();
  assert.equal(token.type, 'text');
  dialog.querySelectorAll('.cred-modal-eye')[0].click();
  assert.equal(token.type, 'password');

  // Empty is refused before anything is sent.
  dialog.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.equal(dialog.querySelector('.cred-modal-error').hidden, false);
  assert.equal(submitted.length, 0);
  token.value = ' tok ';
  ct0.value = 'c';
  dialog.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.deepEqual(submitted, [{ TWITTER_AUTH_TOKEN: 'tok', TWITTER_CT0: 'c' }]);
  assert.equal(document.querySelector('.cred-modal'), null, 'closed after it is saved');
  modal.close();
});

test('the window stays open and says why when the value cannot be saved, and "not now" and Escape skip', async () => {
  const { document } = page();
  let skipped = 0;
  openCredentialModal({ document, language: 'fr', tool: { id: 'rdt-cli', name: 'rdt-cli' }, fields: [{ env: 'REDDIT_SESSION', label: 'reddit_session', type: 'cookie', site: 'reddit.com' }], onSubmit: async () => ({ ok: false, reason: 'bad_value' }), onSkip: () => { skipped += 1; } });
  const dialog = document.querySelector('.cred-modal-dialog');
  assert.equal(dialog.querySelector('.cred-modal-type').textContent, 'Cookie');
  dialog.querySelector('.cred-modal-text').value = 'x';
  dialog.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.ok(document.querySelector('.cred-modal'), 'still open');
  assert.equal(dialog.querySelector('.cred-modal-error').textContent, PERMISSION_TEXTS.fr.credBadValue);
  assert.equal(dialog.querySelector('.cred-modal-button.is-primary').disabled, false, 'it can be tried again');
  [...dialog.querySelectorAll('.cred-modal-button')].find((button) => !button.classList.contains('is-primary')).click();
  assert.equal(skipped, 1);
  assert.equal(document.querySelector('.cred-modal'), null);

  openCredentialModal({ document, language: 'en', tool: TWITTER, fields: TWITTER_FIELDS, onSubmit: async () => ({ ok: true }), onSkip: () => { skipped += 1; } });
  document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(skipped, 2);
  assert.equal(document.querySelector('.cred-modal'), null);
});

test('the card opens the window when the question arrives, is settled by the answer event, and can open the window again', async () => {
  const { document } = page();
  const host = document.createElement('div');
  document.body.append(host);
  const sent = [];
  const cards = createCredentialAskCards({ document, host, language: 'en', onAnswer: async (answer) => { sent.push(answer); return { ok: true }; } });
  const ask = { type: 'credential', event: 'ask', id: 'ask0000000000001', tool: TWITTER, fields: TWITTER_FIELDS, waitMs: 600000 };
  cards.handle(ask);
  cards.handle(ask);
  assert.equal(host.querySelectorAll('.cred-ask').length, 1, 'one card for one question');
  assert.equal(document.querySelectorAll('.cred-modal').length, 1, 'the window opens by itself');
  assert.equal(cards.open, 1);
  assert.equal(host.querySelector('.net-ask-title').textContent, 'twitter-cli needs your login');

  // Typed and saved: the values and the decision go to the handler.
  const dialog = document.querySelector('.cred-modal-dialog');
  const [token, ct0] = dialog.querySelectorAll('.cred-modal-text');
  token.value = 't';
  ct0.value = 'c';
  dialog.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await flush();
  assert.deepEqual(sent, [{ id: 'ask0000000000001', decision: 'saved', values: { TWITTER_AUTH_TOKEN: 't', TWITTER_CT0: 'c' } }]);
  cards.handle({ type: 'credential', event: 'answer', id: 'ask0000000000001', decision: 'saved', tool: TWITTER });
  assert.equal(cards.open, 0);
  assert.equal(host.querySelector('.net-ask-title').textContent, 'Login for twitter-cli saved');
  assert.equal(host.querySelector('.net-ask-actions'), null);
  assert.equal(document.querySelector('.cred-modal'), null);
});

test('"not now" on the card, and an answer that nobody gave in time', async () => {
  const { document } = page();
  const host = document.createElement('div');
  document.body.append(host);
  const sent = [];
  const cards = createCredentialAskCards({ document, host, language: 'en', onAnswer: async (answer) => { sent.push(answer); return { ok: true }; } });
  cards.handle({ type: 'credential', event: 'ask', id: 'ask0000000000002', tool: TWITTER, fields: TWITTER_FIELDS });
  const [enter, skip] = host.querySelectorAll('.net-ask-button');
  skip.click();
  assert.deepEqual(sent, [{ id: 'ask0000000000002', decision: 'cancel' }]);
  assert.equal(document.querySelector('.cred-modal'), null, 'the window goes with it');
  enter.click();
  assert.equal(document.querySelectorAll('.cred-modal').length, 1, 'it can be opened again until the question is over');
  cards.handle({ type: 'credential', event: 'answer', id: 'ask0000000000002', decision: 'timeout', tool: TWITTER });
  assert.equal(document.querySelector('.cred-modal'), null);
  assert.equal(host.querySelector('.net-ask-title').textContent, 'Not entered in time: login for twitter-cli not provided');
  assert.ok(host.querySelector('.cred-ask').classList.contains('is-refused'));
});

test('the answer handler saves every value first (always), then tells the reply; a value that is refused stops there', async () => {
  const saved = [];
  const told = [];
  const run = { answerCredential: async (id, decision) => { told.push([id, decision]); return { ok: true }; } };
  const handle = createCredentialAnswerHandler({ getRun: () => run, save: async (name, value) => { saved.push([name, value]); return { ok: true }; } });
  assert.deepEqual(await handle({ id: 'a', decision: 'saved', values: { A: '1', B: '2' } }), { ok: true });
  assert.deepEqual(saved, [['A', '1'], ['B', '2']]);
  assert.deepEqual(told, [['a', 'saved']]);
  assert.deepEqual(await handle({ id: 'b', decision: 'cancel' }), { ok: true });
  assert.equal(saved.length, 2, 'nothing is saved for "not now"');
  assert.deepEqual(told.at(-1), ['b', 'cancel']);

  const refused = createCredentialAnswerHandler({ getRun: () => run, save: async () => ({ ok: false, reason: 'bad_value' }) });
  assert.deepEqual(await refused({ id: 'c', decision: 'saved', values: { A: '' } }), { ok: false, reason: 'bad_value' });
  assert.equal(told.length, 2, 'the reply is not told');
  assert.deepEqual(await createCredentialAnswerHandler({ getRun: () => null })({ id: 'd', decision: 'cancel' }), { ok: false, reason: 'unavailable' });
});

test('the step list shows the card and the window for a tool\'s login, and passes the answer on', async () => {
  const { createSandboxLedger } = await import('../../src/app/ui/sandbox/sandbox-ledger.js');
  const { document } = page();
  const host = document.createElement('div');
  document.body.append(host);
  const sent = [];
  const ledger = createSandboxLedger({ document, host, language: 'en', onCredentialAnswer: async (answer) => { sent.push(answer); return { ok: true }; } });
  ledger.event({ type: 'credential', event: 'ask', id: 'ask0000000000003', tool: TWITTER, fields: TWITTER_FIELDS, waitMs: 600000 });
  assert.equal(host.querySelectorAll('.cred-ask').length, 1);
  assert.equal(document.querySelectorAll('.cred-modal').length, 1);
  [...document.querySelectorAll('.cred-modal-button')].find((button) => !button.classList.contains('is-primary')).click();
  await flush();
  assert.deepEqual(sent, [{ id: 'ask0000000000003', decision: 'cancel' }]);
  ledger.event({ type: 'credential', event: 'answer', id: 'ask0000000000003', decision: 'cancel', tool: TWITTER });
  assert.equal(host.querySelector('.net-ask-title').textContent, 'Login for twitter-cli not provided');
  ledger.remove();
});
