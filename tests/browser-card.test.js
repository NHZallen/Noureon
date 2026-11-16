import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createBrowserCard } from '../src/app/ui/sandbox/browser-card.js';
import { createSandboxLedger } from '../src/app/ui/sandbox/sandbox-ledger.js';

const call = (action, domain, label) => ({ type: 'browser', event: 'call', action, domain, label });
const make = (options = {}) => {
  const window = new Window();
  const { document } = window;
  const card = createBrowserCard({ document, host: document.body, language: 'en', isWide: () => false, ...options });
  const q = (selector) => document.body.querySelector(selector);
  const steps = () => [...document.body.querySelectorAll('.bcard-step')];
  return { window, document, card, q, steps };
};

test('the capsule says what is being done, with the ring that turns; a press turns the card over to the steps and the cross turns it back', () => {
  const { window, card, q, steps } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.equal(q('.bcard-capsule .bcard-text').textContent, 'Browsing: acme.com');
    assert.ok(q('.bcard-capsule .bcard-spin'), 'the ring turns while it runs');
    assert.equal(q('.bcard-site').textContent, 'acme.com');
    assert.equal(card.view, 'front');
    q('.bcard-capsule').click();
    assert.equal(card.view, 'back');
    assert.ok(q('.bcard-card').classList.contains('is-flipped'));
    assert.equal(q('.bcard-back-head span').textContent, 'Task progress');
    assert.equal(steps().length, 1);
    q('.bcard-back-close').click();
    assert.equal(card.view, 'front');
    assert.ok(!q('.bcard-card').classList.contains('is-flipped'));
  } finally {
    window.happyDOM.abort();
  }
});

test('thirty clicks on a site are one step; another site is a step of its own; the step before is ticked', () => {
  const { window, card, steps } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    for (let i = 0; i < 30; i += 1) card.handle(call(i % 2 ? 'type' : 'click', 'acme.com', 'Working the browser on acme.com'));
    assert.equal(steps().length, 2);
    assert.ok(steps()[0].classList.contains('is-done'));
    assert.ok(steps()[1].classList.contains('is-run'));
    card.handle(call('open', 'other.org', 'Browsing: other.org'));
    card.handle(call('click', 'other.org', 'Working the browser on other.org'));
    assert.equal(steps().length, 4);
  } finally {
    window.happyDOM.abort();
  }
});

test('when the browser is closed the card folds into the tag "Done"; the tag opens the card again, with only the shrink button', () => {
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.handle(call('close', '', 'Closing the browser'));
    assert.equal(card.phase, 'done');
    assert.equal(card.view, 'pill');
    assert.ok(q('.bcard-pill').classList.contains('is-tag'));
    assert.equal(q('.bcard-pill .bcard-text').textContent, 'Done');
    assert.ok(q('.bcard-pill .bcard-icon').classList.contains('is-done'), 'the green tick');
    assert.equal(q('.bcard-card').hidden, true);
    q('.bcard-pill').click();
    assert.equal(card.view, 'front');
    assert.equal(q('.bcard-buttons .bcard-round[aria-label="Cancel the task"]').hidden, true, 'nothing to cancel any more');
    assert.equal(q('.bcard-buttons .bcard-round').hidden, false, 'the shrink button stays');
  } finally {
    window.happyDOM.abort();
  }
});

test('the end of the reply ends the work even when the model did not close the browser', () => {
  const { window, card, steps } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.complete();
    assert.equal(card.phase, 'done');
    assert.ok(steps()[0].classList.contains('is-done'));
  } finally {
    window.happyDOM.abort();
  }
});

test('cancelling asks first; "Keep going" leaves the work alone; "Cancel task" stops it once and the card is the tag "Cancelled"', () => {
  let cancelled = 0;
  const { window, document, card, q } = make({ onCancel: () => { cancelled += 1; } });
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    q('.bcard-buttons .bcard-round[aria-label="Cancel the task"]').click();
    assert.equal(document.body.querySelector('.bcard-dialog-text').textContent, 'Cancel the task?');
    assert.match(document.body.querySelector('.bcard-dialog-body').textContent, /stops the model right away/);
    document.body.querySelector('.bcard-dialog-button:not(.is-primary)').click();
    assert.equal(document.body.querySelector('.bcard-dialog'), null);
    assert.equal(cancelled, 0);
    assert.equal(card.phase, 'run');
    q('.bcard-buttons .bcard-round[aria-label="Cancel the task"]').click();
    document.body.querySelector('.bcard-dialog-button.is-danger').click();
    assert.equal(cancelled, 1);
    assert.equal(card.phase, 'cancelled');
    assert.equal(q('.bcard-pill .bcard-text').textContent, 'Cancelled');
    assert.ok(q('.bcard-pill').classList.contains('is-tag'));
    card.handle(call('click', 'acme.com', 'Working the browser on acme.com'));
    assert.equal(card.phase, 'cancelled', 'a late event does not bring it back');
  } finally {
    window.happyDOM.abort();
  }
});

test('a queue is a pill with its own cross (no card yet); the card comes when the browser is there; a failure is the red cross', () => {
  const { window, card, q } = make();
  try {
    card.handle({ type: 'browser', event: 'queued', position: 2, label: 'Waiting for a free browser (2 ahead)' });
    assert.equal(card.view, 'pill');
    assert.equal(q('.bcard-pill .bcard-text').textContent, 'Waiting for a free browser (2 ahead)');
    assert.equal(q('.bcard-card').hidden, true);
    assert.equal(q('.bcard-pill-cross').hidden, false);
    q('.bcard-pill').click();
    assert.equal(card.view, 'pill', 'a press on the pill does not open a card that is not there');
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.equal(card.phase, 'run');
    assert.equal(card.view, 'front');
    assert.equal(q('.bcard-pill-cross').hidden, true);
    card.handle({ type: 'browser', event: 'failed', label: 'The browser is not available now' });
    assert.equal(card.phase, 'failed');
    assert.ok(q('.bcard-capsule .bcard-icon').classList.contains('is-fail'));
    assert.equal(q('.bcard-capsule .bcard-text').textContent, 'The browser is not available now');
  } finally {
    window.happyDOM.abort();
  }
});

test('the process list draws the card under its line and gives it the cancel of the reply; the end of the answer ends it', async () => {
  const window = new Window();
  try {
    const { document } = window;
    let cancelled = 0;
    const ledger = createSandboxLedger({ document, host: document.body, language: 'en', summary: true, onBrowserCancel: () => { cancelled += 1; } });
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(document.body.querySelector('.ask-host .bcard'), 'the card is in the conversation, outside the list of steps');
    assert.equal(document.body.querySelectorAll('.ledger-row[data-kind="browser"]').length, 0, 'not a row of the list');
    document.body.querySelector('.bcard-buttons .bcard-round[aria-label="Cancel the task"]').click();
    document.body.querySelector('.bcard-dialog-button.is-danger').click();
    assert.equal(cancelled, 1);
    ledger.event({ type: 'answering' });
  } finally {
    window.happyDOM.abort();
  }
});

const fakeLive = () => {
  const calls = [];
  const source = { mount(el) { el.append(el.ownerDocument.createElement('div')); }, mountLens(el) { el.append(el.ownerDocument.createElement('div')); }, destroy() {}, input: { pointer() {}, wheel() {}, key() {}, text() {} } };
  const controller = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  return { calls, live: { source, controller, tabs: [{ id: 't1', title: 'Acme', active: true }] } };
};

test('with a live picture the screen of the card is the picture and the circle; the placeholder goes', () => {
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.equal(q('.bcard-screen').hidden, false);
    const { live } = fakeLive();
    card.setLive(live);
    assert.equal(q('.bcard-screen').hidden, true);
    assert.ok(q('.bcard-front .bcard-live .bl-picture'));
    assert.equal(q('.bcard-card').style.aspectRatio, '1024 / 768');
    card.moveCursor(0.4, 0.6, 'model');
    assert.equal(q('.bl-lens').style.left, '40%');
    card.setLive(null);
    assert.equal(q('.bcard-screen').hidden, false);
    assert.equal(q('.bcard-live'), null);
  } finally {
    window.happyDOM.abort();
  }
});

test('with a live picture a press on the pill, or on the picture, opens the focus mode; its cross goes back to the pill and "Expand" to the card', () => {
  const { window, card, q, document } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.setLive(fakeLive().live);
    q('.bl-view').click();
    assert.ok(document.querySelector('.bf'), 'a press on the picture');
    document.querySelector('.bf-top .bf-icon:first-child').click();
    assert.equal(document.querySelector('.bf'), null);
    assert.equal(card.view, 'pill');
    q('.bcard-pill').click();
    assert.ok(document.querySelector('.bf'), 'a press on the pill');
    document.querySelector('.bf-expand').click();
    assert.equal(document.querySelector('.bf'), null);
    assert.equal(card.view, 'front');
  } finally {
    window.happyDOM.abort();
  }
});

test('in the focus mode: Stop asks the same question as the cross of the card; the ratio chosen there is the ratio of the card and stays; taking over is told to the owner', () => {
  let cancelled = 0;
  const { window, card, q, document } = make({ onCancel: () => { cancelled += 1; } });
  try {
    const { live, calls } = fakeLive();
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.setLive(live);
    card.openFocus();
    document.querySelector('.bf-act:not(.is-primary)').click();
    assert.equal(document.querySelector('.bcard-dialog-text').textContent, 'Cancel the task?');
    document.querySelector('.bcard-dialog-button:not(.is-danger)').click();
    document.querySelector('.bf-top .bf-icon:last-child').click();
    [...document.querySelectorAll('.bf-menu-ratio')].find((node) => node.getAttribute('aria-label') === 'Upright').click();
    assert.equal(card.ratio, 'portrait');
    assert.equal(q('.bcard-card').style.aspectRatio, '768 / 1024');
    assert.deepEqual(calls.at(-1), ['onRatio', 'portrait']);
    document.querySelector('.bf-act.is-primary').click();
    assert.deepEqual(calls.at(-1), ['onTakeOver']);
    assert.equal(document.querySelector('.bf').dataset.control, 'user');
    document.querySelector('.bf-actions .is-primary:not([hidden])').click();
    assert.deepEqual(calls.at(-1), ['onGiveBack']);
    card.closeFocus();
    card.setLive({ ...live, ratio: undefined });
    assert.equal(card.ratio, 'portrait', 'the ratio does not go back by itself');
    card.openFocus();
    document.querySelector('.bf-act:not(.is-primary)').click();
    document.querySelector('.bcard-dialog-button.is-danger').click();
    assert.equal(cancelled, 1);
    assert.equal(document.querySelector('.bf'), null, 'cancelling closes the focus mode');
  } finally {
    window.happyDOM.abort();
  }
});

test('on a computer the pill opens the side panel that takes its room from the chat; Enlarge makes it big, the edge sets the width, and the cross gives the room back', () => {
  const { window, document, card } = make({ isWide: () => true });
  try {
    const { live, calls } = fakeLive();
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.setLive({ ...live, url: 'https://acme.com/bill' });
    card.openFocus();
    const root = document.documentElement;
    assert.equal(root.getAttribute('data-browser-panel'), 'panel');
    assert.equal(root.style.getPropertyValue('--browser-panel-w'), '416px');
    assert.ok(document.querySelector('.bf.is-panel'));
    assert.ok(document.querySelector('.bf-resize'));
    assert.equal(document.querySelector('.bf-pad'), null, 'no trackpad on a computer: the person points at the screen');
    document.querySelector('.bf-head .bf-icon').click();
    assert.equal(root.getAttribute('data-browser-panel'), 'zoom');
    assert.match(root.style.getPropertyValue('--browser-panel-w'), /^calc\(100vw/);
    assert.equal(card.zoomed, true);
    assert.deepEqual(calls.at(-1), ['onZoom', true], 'the owner of the picture is told too');
    document.querySelector('.bf-expand').click();
    assert.equal(card.zoomed, false);
    assert.equal(root.getAttribute('data-browser-panel'), 'panel');
    document.querySelector('.bf-head > .bf-icon:last-child').click();
    assert.equal(root.getAttribute('data-browser-panel'), null);
    assert.equal(document.querySelector('.bf'), null);
    assert.equal(card.view, 'pill');
  } finally {
    window.happyDOM.abort();
  }
});

test('on a computer the person who has the browser points at the screen itself: the mouse, the wheel, the keys and the address row', () => {
  const { window, document, card } = make({ isWide: () => true });
  try {
    const { live, calls } = fakeLive();
    const log = [];
    live.source.input = { pointer: (...a) => log.push(['pointer', ...a]), wheel: (...a) => log.push(['wheel', ...a]), key: (...a) => log.push(['key', ...a]), text: (...a) => log.push(['text', ...a]) };
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.setLive({ ...live, url: 'https://acme.com/bill' });
    card.openFocus();
    const screen = document.querySelector('.bf .bl-view');
    screen.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 5, clientY: 5 }));
    assert.deepEqual(log, [], 'while the model has it, the mouse does nothing');
    assert.equal(document.querySelector('.bf-url').hidden, true);
    document.querySelector('.bf-act.is-primary').click();
    assert.equal(document.querySelector('.bf-url').hidden, false);
    assert.equal(document.querySelector('.bf-url-field').value, 'https://acme.com/bill');
    screen.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));
    const wheel = new window.Event('wheel');
    Object.assign(wheel, { deltaX: 0, deltaY: 120, clientX: 0, clientY: 0 });
    screen.dispatchEvent(wheel);
    const key = new window.Event('keydown');
    Object.assign(key, { key: 'a', ctrlKey: false, metaKey: false });
    screen.dispatchEvent(key);
    assert.deepEqual(log.map((entry) => entry[0]), ['pointer', 'wheel', 'key']);
    const field = document.querySelector('.bf-url-field');
    field.value = 'https://example.com';
    const enter = new window.Event('keydown');
    Object.assign(enter, { key: 'Enter' });
    field.dispatchEvent(enter);
    assert.deepEqual(calls.at(-1), ['onNavigate', 'https://example.com']);
  } finally {
    window.happyDOM.abort();
  }
});

test('a question of the server takes the place of the card; the answer goes out once; the server saying it is over takes the panel away', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push([id, payload]) });
  w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'shop.example', label: 'x' });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'confirm', action: 'payment', domain: 'shop.example', summary: 'Pay 12 dollars' });
  const root = w.card.element;
  assert.equal(root.querySelector('.bcard-card').hidden, true);
  assert.equal(root.querySelector('.bcard-panel').hidden, false);
  assert.match(root.querySelector('.bpanel-summary').textContent, /Pay 12 dollars/);
  assert.match(root.querySelector('.bcard-text').textContent, /確認|OK/);
  const [cancel, confirm] = root.querySelectorAll('.bpanel-button');
  confirm.click(); confirm.click(); cancel.click();
  assert.deepEqual(answers, [['ask-1', { decision: 'confirm' }]]);
  w.card.handle({ type: 'browser', event: 'answer', id: 'ask-1', kind: 'confirm', decision: 'confirm' });
  assert.equal(root.querySelector('.bcard-card').hidden, false);
  assert.equal(root.querySelector('.bcard-panel').hidden, true);
});

test('a question while the card is a pill: the pill says it needs you and a button opens the question; deleting is red; a kind that is not known leaves the card alone', () => {
  const w = make();
  w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'a.example', label: 'x' });
  w.card.element.querySelector('.bcard-round').click(); // to a pill
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-2', kind: 'confirm', action: 'delete', domain: 'a.example', summary: 'Delete the file' });
  const root = w.card.element;
  assert.equal(root.querySelector('.bcard-pill').hidden, false);
  assert.equal(root.querySelector('.bcard-ask-open').hidden, false);
  assert.ok(root.querySelector('.bcard-pill .bcard-icon.is-help'), 'the yellow triangle');
  root.querySelector('.bcard-ask-open').click();
  assert.equal(root.querySelector('.bcard-panel').hidden, false);
  assert.ok(root.querySelector('.bpanel-button.is-danger'));
  const w2 = make();
  w2.card.handle({ type: 'browser', event: 'ask', id: 'ask-3', kind: 'unknown-kind' });
  assert.equal(w2.card.element.querySelector('.bcard-panel').hidden, true);
});

const typeInto = (input, text) => { input.value = text; input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true })); };

test('the login panel: the ways of the page; the user name and password open on their choice, go out once, and are wiped', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push([id, payload]) });
  w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'github.com', label: 'x' });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'login', domain: 'github.com', methods: ['password', 'google', 'takeover'] });
  const root = w.card.element;
  assert.deepEqual([...root.querySelectorAll('.bpanel-method')].map((b) => b.textContent), ['User name and password', 'Google', 'Take over instead']);
  assert.equal(root.querySelector('.bpanel-form').hidden, true);
  [...root.querySelectorAll('.bpanel-method')][0].click();
  assert.equal(root.querySelector('.bpanel-form').hidden, false);
  const [user, pass] = root.querySelectorAll('.bpanel-input');
  assert.equal(pass.type, 'password');
  assert.equal(root.querySelector('.bpanel-form button[type=submit]').disabled, true, 'both fields are needed');
  typeInto(user, 'who@example.com'); typeInto(pass, 'S3cret-pw-1');
  assert.equal(root.querySelector('.bpanel-form button[type=submit]').disabled, false);
  root.querySelector('.bpanel-form').dispatchEvent(new (root.ownerDocument.defaultView.Event)('submit', { bubbles: true, cancelable: true }));
  assert.deepEqual(answers, [['ask-1', { method: 'password', username: 'who@example.com', password: 'S3cret-pw-1', save: true }]]);
  assert.equal(pass.value, '', 'the password is not left in the page');
  w.card.handle({ type: 'browser', event: 'answer', id: 'ask-1', kind: 'login', decision: 'password' });
  assert.ok(!root.textContent.includes('S3cret'));
});

test('the login panel: another way is one tap; taking over is a way; a login not to be saved is said so', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push(payload) });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'login', domain: 'a.example', methods: ['google', 'takeover'] });
  [...w.card.element.querySelectorAll('.bpanel-method')][0].click();
  assert.deepEqual(answers, [{ method: 'google' }]);
  const w2 = make({ onAnswer: (id, payload) => answers.push(payload) });
  w2.card.handle({ type: 'browser', event: 'ask', id: 'ask-2', kind: 'login', domain: 'a.example', methods: ['password'] });
  w2.card.element.querySelector('.bpanel-method').click();
  const [user, pass] = w2.card.element.querySelectorAll('.bpanel-input');
  typeInto(user, 'u'); typeInto(pass, 'p');
  w2.card.element.querySelector('input[type=checkbox]').checked = false;
  w2.card.element.querySelector('.bpanel-form').dispatchEvent(new (w2.card.element.ownerDocument.defaultView.Event)('submit', { bubbles: true, cancelable: true }));
  assert.equal(answers.at(-1).save, false);
});

test('the code panel: cells fill from the keypad, the code goes out only when whole, and another way is always there', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push(payload) });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'code', domain: 'github.com', digits: 6 });
  const root = w.card.element;
  assert.equal(root.querySelectorAll('.bpanel-cell').length, 6);
  const key = (label) => [...root.querySelectorAll('.bpanel-key')].find((b) => b.textContent === label);
  const send = [...root.querySelectorAll('.bpanel-button')].find((b) => b.textContent === 'Send');
  for (const digit of '12345') key(digit).click();
  assert.equal(send.disabled, true);
  key('⌫').click(); key('5').click(); key('6').click(); key('7').click(); // a seventh digit is not taken
  assert.equal([...root.querySelectorAll('.bpanel-cell')].map((c) => c.textContent).join(''), '123456');
  assert.equal(send.disabled, false);
  send.click(); send.click();
  assert.deepEqual(answers, [{ code: '123456' }]);
  const w2 = make({ onAnswer: (id, payload) => answers.push(payload) });
  w2.card.handle({ type: 'browser', event: 'ask', id: 'ask-2', kind: 'code', digits: 4 });
  w2.card.element.querySelector('.bpanel-link').click();
  assert.deepEqual(answers.at(-1), { method: 'other' });
});

test('the hand-over panel: the card stays, the person can take over, and giving the browser back answers it', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push(payload) });
  w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'a.example', label: 'x' });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'takeover', domain: 'a.example', reason: 'Sign in with Google' });
  const root = w.card.element;
  assert.equal(root.querySelector('.bcard-card').hidden, false, 'the screen stays in view');
  assert.equal(root.querySelector('.bcard-panel').hidden, false);
  assert.match(root.querySelector('.bpanel-summary').textContent, /Sign in with Google/);
  const [cancel, , done] = root.querySelectorAll('.bpanel-button');
  done.click(); done.click(); cancel.click();
  assert.deepEqual(answers, [{ decision: 'done' }]);
});

test('the payment panel: three ways, one tap each', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push(payload) });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'payment', domain: 'shop.example', methods: ['card', 'applepay', 'other'] });
  assert.deepEqual([...w.card.element.querySelectorAll('.bpanel-method')].map((b) => b.textContent), ['Credit card (used once)', 'Apple Pay', 'Another way']);
  w.card.element.querySelector('.bpanel-method').click();
  assert.deepEqual(answers, [{ method: 'card' }]);
});

function cardWorld({ response = { ok: true, status: 200, json: async () => ({ ok: true, filled: ['number', 'exp', 'cvc', 'name'], missing: ['line1'] }) } } = {}) {
  const answers = []; const posts = [];
  const fetchImpl = async (url, init) => { posts.push([url, init]); return response; };
  const w = make({ onAnswer: (id, payload) => answers.push(payload), fetchImpl });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'card', domain: 'shop.example', host: 'live.example.com', path: `/s/${'a'.repeat(32)}/card`, ticket: 'f'.repeat(48) });
  const root = w.card.element;
  const inputs = () => [...root.querySelectorAll('.bpanel-input')];
  const buttons = () => [...root.querySelectorAll('.bpanel-row .bpanel-button')];
  return { w, root, answers, posts, inputs, buttons };
}
const settleCard = () => new Promise((resolve) => setTimeout(resolve, 5));

test('the card panel: two steps, the next one is grey until what is required is in, the card goes straight to the host with the ticket, and only field names go to the server', async () => {
  const c = cardWorld();
  const [number, exp, cvc, name] = c.inputs();
  assert.equal(c.buttons()[1].disabled, true);
  typeInto(number, '4242424242424242'); assert.equal(number.value, '4242 4242 4242 4242', 'groups of four');
  typeInto(exp, '0829'); assert.equal(exp.value, '08/29', 'the slash');
  typeInto(cvc, '12a3'); assert.equal(cvc.value, '123');
  assert.equal(c.buttons()[1].disabled, true, 'the name is still needed');
  assert.match(c.root.querySelector('.bpanel-hint').textContent, /Still needed: Name on the card/);
  typeInto(name, 'Chen Da-Ming');
  assert.equal(c.buttons()[1].disabled, false);
  c.buttons()[1].click(); // next
  assert.equal(c.buttons()[0].textContent, 'Back');
  assert.equal(c.buttons()[1].disabled, true, 'the address is required');
  c.buttons()[0].click(); // back to the first step, what was typed is kept
  assert.equal(number.value, '4242 4242 4242 4242');
  c.buttons()[1].click();
  const line1 = c.inputs().find((i) => !i.closest('div').hidden && i !== number) ? c.root.querySelectorAll('.bpanel-input')[4] : null;
  typeInto(line1, '1 Main St');
  assert.equal(c.buttons()[1].disabled, false);
  c.buttons()[1].click();
  await settleCard();
  assert.equal(c.posts.length, 1);
  const [url, init] = c.posts[0];
  assert.equal(url, `https://live.example.com/s/${'a'.repeat(32)}/card`);
  assert.equal(init.headers.Authorization, `Bearer ${'f'.repeat(48)}`);
  assert.equal(init.credentials, 'omit');
  assert.deepEqual(JSON.parse(init.body), { number: '4242 4242 4242 4242', exp: '08/29', cvc: '123', name: 'Chen Da-Ming', line1: '1 Main St' });
  assert.deepEqual(c.answers, [{ done: true, filled: ['number', 'exp', 'cvc', 'name'], missing: ['line1'] }]);
  assert.ok(!JSON.stringify(c.answers).includes('4242'));
  assert.ok(c.inputs().every((i) => i.value === ''), 'what was typed is wiped');
});

test('the card panel: a refused send says so and can be tried again; cancel goes out as a cancel; nothing is sent twice', async () => {
  const c = cardWorld({ response: { ok: false, status: 409, json: async () => ({ error: 'not_filled' }) } });
  const [number, exp, cvc, name] = c.inputs();
  typeInto(number, '4242424242424242'); typeInto(exp, '0829'); typeInto(cvc, '123'); typeInto(name, 'A');
  c.buttons()[1].click();
  typeInto(c.root.querySelectorAll('.bpanel-input')[4], 'x');
  c.buttons()[1].click();
  await settleCard();
  assert.equal(c.root.querySelector('.bpanel-error').hidden, false);
  assert.deepEqual(c.answers, []);
  assert.equal(c.buttons()[1].disabled, false, 'tried again');
  const d = cardWorld();
  d.buttons()[0].click();
  assert.deepEqual(d.answers, [{ cancel: true }]);
  d.buttons()[0].click();
  assert.equal(d.answers.length, 1);
});
