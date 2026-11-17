import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrowserAsk } from '../../server/browser-ask.js';
import { tripwireFor, pageTakesCard } from '../../server/browser-tripwire.js';

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
