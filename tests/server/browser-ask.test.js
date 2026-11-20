import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrowserAsk } from '../../server/browser-ask.js';
import { tripwireFor, pageSubject, pageTakesCard } from '../../server/browser-tripwire.js';

function setup(options = {}) {
  const events = [];
  let clock = 1000;
  const waited = [];
  const asker = createBrowserAsk({ emit: (event) => events.push(event), now: () => clock, onWaited: (ms) => waited.push(ms), makeId: () => 'ask-000001', ...options });
  return { asker, events, waited, advance: (ms) => { clock += ms; } };
}

test('a confirmation waits for the answer, tells the pages, and the time waited is told', async () => {
  const t = setup();
  const pending = t.asker.ask('confirm', { action: 'payment', domain: 'shop.example', summary: 'Pay 12 dollars for the red shoes' });
  assert.deepEqual(t.events[0], { type: 'browser', event: 'ask', id: 'ask-000001', kind: 'confirm', waitMs: 600000, action: 'payment', domain: 'shop.example', summary: 'Pay 12 dollars for the red shoes' });
  t.advance(4000);
  assert.deepEqual(t.asker.answer('ask-000001', { decision: 'confirm' }), { answered: true });
  assert.deepEqual(await pending, { decision: 'confirm' });
  assert.deepEqual(t.events[1], { type: 'browser', event: 'answer', id: 'ask-000001', kind: 'confirm', decision: 'confirm' });
  assert.deepEqual(t.waited, [4000]);
  assert.deepEqual(t.asker.answer('ask-000001', { decision: 'cancel' }), { answered: false }, 'a question is answered once');
});

test('what is not an answer to the question is not taken; an unknown action is the strictest one', async () => {
  const t = setup();
  const pending = t.asker.ask('confirm', { action: 'whatever', domain: 'd', summary: 's' });
  assert.equal(t.events[0].action, 'irreversible');
  for (const bad of [{}, { decision: 'maybe' }, { method: 'password' }, null, 'confirm']) assert.deepEqual(t.asker.answer('ask-000001', bad), { answered: false });
  t.asker.answer('ask-000001', { decision: 'cancel' });
  assert.deepEqual(await pending, { decision: 'cancel' });
});

test('"Other": words written instead of choosing are taken for every question but a card, and are never a way around the choice', async () => {
  for (const [kind, info] of [['confirm', { action: 'change' }], ['login', { methods: ['password'] }], ['payment', {}], ['takeover', {}], ['code', {}]]) {
    const t = setup();
    const pending = t.asker.ask(kind, info);
    assert.deepEqual(t.asker.answer('ask-000001', { other: '  ' }), { answered: false }, 'empty words are not an answer');
    t.asker.answer('ask-000001', { other: 'Use my work email instead?' });
    assert.deepEqual(await pending, { other: 'Use my work email instead?' }, kind);
    assert.equal(t.events.at(-1).decision, 'other');
  }
  const t = setup();
  t.asker.ask('card', { domain: 'd' });
  assert.deepEqual(t.asker.answer('ask-000001', { other: 'here is my card number' }), { answered: false }, 'a card is never asked for in words');
  t.asker.cancelAll();
});

test('no answer in time is a timeout, and a stopped reply is cancelled', async () => {
  const t = setup({ waitMs: 5 });
  assert.deepEqual(await t.asker.ask('confirm', { action: 'delete', domain: 'd', summary: 's' }), { timeout: true });
  const controller = new AbortController();
  const stopped = setup({ signal: controller.signal });
  const pending = stopped.asker.ask('confirm', { action: 'delete', domain: 'd', summary: 's' });
  controller.abort();
  assert.deepEqual(await pending, { cancelled: true });
});

test('a login answer carries a password to the reply and never into an event; a code is digits only', async () => {
  const t = setup();
  const login = t.asker.ask('login', { domain: 'github.com', methods: ['password', 'google', 'hack'] });
  assert.deepEqual(t.events[0].methods, ['password', 'google']);
  assert.deepEqual(t.asker.answer('ask-000001', { method: 'password', username: 'u' }), { answered: false }, 'a password is needed');
  t.asker.answer('ask-000001', { method: 'password', username: 'who@example.com', password: 'S3cret-pw-1', save: true });
  assert.deepEqual(await login, { method: 'password', username: 'who@example.com', password: 'S3cret-pw-1', save: true });
  assert.ok(!JSON.stringify(t.events).includes('S3cret') && !JSON.stringify(t.events).includes('who@example'));
  assert.equal(t.events.at(-1).decision, 'password');
  const t2 = setup();
  const code = t2.asker.ask('code', { domain: 'github.com', digits: 6 });
  assert.deepEqual(t2.asker.answer('ask-000001', { code: '12ab56' }), { answered: false });
  t2.asker.answer('ask-000001', { code: '123456' });
  assert.deepEqual(await code, { method: 'code', code: '123456' });
  assert.ok(!JSON.stringify(t2.events).includes('123456'));
  const t3 = setup();
  const again = t3.asker.ask('code', { domain: 'github.com', digits: 6 });
  t3.asker.answer('ask-000001', { method: 'resend' });
  assert.deepEqual(await again, { method: 'resend' }, 'a person can ask for the code to be sent again');
  await assert.rejects(setup().asker.ask('nonsense'), /not a question/);
});

test('the tripwire: plainly paying, deleting or changing buttons, in five languages; ordinary clicks pass', () => {
  const button = (name, role = 'button') => ({ role, name });
  for (const name of ['Pay now', 'Place your order', 'Buy now', '付款', '確認訂單', 'Payer', 'Valider la commande', 'Оплатить', 'Оформить заказ', 'Pagar', 'Confirmar pedido']) assert.equal(tripwireFor(button(name)), 'payment', name);
  for (const name of ['Delete account', '刪除', 'Supprimer le compte', 'Удалить', 'Eliminar cuenta']) assert.equal(tripwireFor(button(name)), 'delete', name);
  for (const name of ['Change password', '修改密碼', 'Changer le mot de passe', 'Сменить пароль', 'Cambiar contraseña']) assert.equal(tripwireFor(button(name, 'link')), 'change', name);
  for (const name of ['Search', 'Add to cart', '加入購物車', 'Next', 'Sign in', 'Show details', 'Payroll', 'Remove filter']) assert.equal(tripwireFor(button(name)), null, name);
  assert.equal(tripwireFor({ role: 'textbox', name: 'Delete' }), null, 'only things that are clicked');
  assert.equal(tripwireFor(null), null);
  assert.equal(tripwireFor(button('x'.repeat(200))), null);
});

test('on a page that takes a card, a button that sends the form counts as paying; elsewhere it is an ordinary click', () => {
  const elements = [{ role: 'textbox', name: 'Card number' }, { role: 'textbox', name: 'CVC' }, { role: 'button', name: 'Continue' }];
  assert.equal(pageTakesCard(elements), true);
  assert.equal(pageTakesCard([{ role: 'textbox', name: 'Search' }]), false);
  assert.equal(tripwireFor({ role: 'button', name: 'Continue' }, { takesCard: true }), 'payment');
  assert.equal(tripwireFor({ role: 'button', name: 'Continue' }, { takesCard: false }), null);
  assert.equal(tripwireFor({ role: 'link', name: 'Continue' }, { takesCard: true }), null);
});

test('a button with a general name counts as what the page is about: deleting or paying; elsewhere it is an ordinary click', () => {
  const page = (title, text) => ({ title, text });
  assert.equal(pageSubject(page('測試商店', '訂單 #1001：這筆訂單可以取消並刪除。')), 'delete');
  assert.equal(pageSubject(page('Account', 'Delete your account? This cannot be undone.')), 'delete');
  assert.equal(pageSubject(page('Cart', 'Order total $20. Checkout')), 'payment');
  assert.equal(pageSubject(page('Contact us', 'Write us a message and we will answer.')), null);
  assert.equal(pageSubject(null), null);
  for (const name of ['送出', 'Submit', 'Confirm', 'OK', '確認', 'Envoyer', 'Отправить', 'Enviar', 'Continue.']) {
    assert.equal(tripwireFor({ role: 'button', name }, { subject: 'delete' }), 'delete', name);
    assert.equal(tripwireFor({ role: 'button', name }, { subject: null }), null, `${name} on an ordinary page`);
  }
  assert.equal(tripwireFor({ role: 'button', name: 'Send message to support' }, { subject: 'delete' }), null, 'only a name that is just a general word');
  assert.equal(tripwireFor({ role: 'link', name: 'Submit' }, { subject: 'delete' }), null, 'a button, not a link');
  assert.equal(tripwireFor({ role: 'button', name: 'Add to cart' }, { subject: 'payment' }), null);
});

test('a hand-over to the person is answered done or cancelled', async () => {
  const t = setup();
  const pending = t.asker.ask('takeover', { domain: 'github.com', reason: 'Sign in with Google' });
  assert.deepEqual(t.events[0], { type: 'browser', event: 'ask', id: 'ask-000001', kind: 'takeover', waitMs: 600000, domain: 'github.com', reason: 'Sign in with Google' });
  assert.deepEqual(t.asker.answer('ask-000001', { decision: 'maybe' }), { answered: false });
  t.asker.answer('ask-000001', { decision: 'done' });
  assert.deepEqual(await pending, { decision: 'done' });
});

test('when the person ends the browser every open question ends as cancelled, and the pages are told', async () => {
  const t = setup();
  const pending = t.asker.ask('confirm', { action: 'payment', domain: 'shop.example', summary: 'Pay' });
  t.asker.cancelAll();
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(t.events.at(-1).decision, 'cancel');
  assert.deepEqual(t.asker.answer('ask-000001', { decision: 'confirm' }), { answered: false }, 'nothing is left to answer');
  t.asker.cancelAll(); // no question open: nothing happens
});
