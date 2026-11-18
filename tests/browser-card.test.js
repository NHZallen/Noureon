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
    assert.equal(q('.bcard-site').textContent, 'Starting the browser…');
    assert.equal(card.view, 'front');
    q('.bcard-capsule').click();
    assert.equal(card.view, 'back');
    assert.ok(q('.bcard-card').classList.contains('is-flipped'));
    assert.equal(q('.bcard-back-head span').textContent, 'Work list');
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
    assert.match(document.body.querySelector('.bcard-dialog-body').textContent, /closes the browser, and the model goes on/);
    document.body.querySelector('.bcard-dialog-button:not(.is-primary)').click();
    assert.equal(document.body.querySelector('.bcard-dialog'), null);
    assert.equal(cancelled, 0);
    assert.equal(card.phase, 'run');
    q('.bcard-buttons .bcard-round[aria-label="Cancel the task"]').click();
    document.body.querySelector('.bcard-dialog-button.is-danger').click();
    assert.equal(cancelled, 1);
    assert.equal(card.phase, 'cancelled');
    assert.equal(q('.bcard-pill .bcard-text').textContent, 'Stopped');
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

test('the first words of a server reply end the browser work at once: the card says done while the answer is still being written', async () => {
  const window = new Window();
  try {
    const { document } = window;
    const ledger = createSandboxLedger({ document, host: document.body, language: 'en', summary: true });
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(document.body.querySelector('.bcard').dataset.phase, 'run');
    ledger.browserDone();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(document.body.querySelector('.bcard').dataset.phase, 'done');
    assert.equal(document.body.querySelector('.bcard-pill .bcard-text').textContent, 'Done');
  } finally {
    window.happyDOM.abort();
  }
});

test('a card that comes into the conversation rises and fades in; one that finishes folds with the shrink of the pill; a saved tag moves in neither', () => {
  const { window, document, card, q } = make({ enter: true });
  try {
    assert.equal(q('.bcard').dataset.enter, '1');
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.complete();
    assert.equal(q('.bcard').dataset.morph, 'fold', 'folds into its pill by itself');
    assert.equal(card.view, 'pill');
    const quiet = make();
    quiet.card.handle(call('open', 'acme.com', 'x'));
    assert.equal(quiet.q('.bcard').dataset.enter, undefined);
    assert.ok(document);
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

test('the focus mode goes back to where it was opened from, and its round button follows: Shrink from the card (it becomes the pill), Expand from the pill (the pill becomes the card)', () => {
  const { window, card, q, document } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.setLive(fakeLive().live);
    // The card: a press on the picture, only the cross or the empty room: back to the card.
    q('.bl-view').click();
    assert.ok(document.querySelector('.bf'), 'a press on the picture');
    assert.equal(document.querySelector('.bf-round[data-act="shrink"]').getAttribute('aria-label'), 'Shrink to a pill', 'from the card the button is Shrink');
    assert.equal(document.querySelector('.bf-round[data-act="expand"]'), null);
    document.querySelector('.bf-top .bf-icon:first-child').click();
    assert.equal(document.querySelector('.bf'), null);
    assert.equal(card.view, 'front', 'only the cross: the card is not shrunk');
    // The card: Shrink in the focus mode leaves it and the card becomes the pill.
    q('.bl-view').click();
    document.querySelector('.bf-round[data-act="shrink"]').click();
    assert.equal(document.querySelector('.bf'), null);
    assert.equal(card.view, 'pill');
    assert.equal(q('.bcard').dataset.morph, 'fold');
    // The pill: a press opens the focus mode, whose button is Expand; the cross gives the pill back.
    q('.bcard-pill').click();
    assert.ok(document.querySelector('.bf'), 'a press on the pill');
    assert.ok(document.querySelector('.bf-round[data-act="expand"]'), 'from the pill the button is Expand');
    assert.equal(document.querySelector('.bf-round[data-act="shrink"]'), null);
    document.querySelector('.bf-top .bf-icon:first-child').click();
    assert.equal(card.view, 'pill', 'no Expand pressed: still the pill');
    // Expand: the pill grows into the card.
    q('.bcard-pill').click();
    document.querySelector('.bf-round[data-act="expand"]').click();
    assert.equal(document.querySelector('.bf'), null);
    assert.equal(card.view, 'front');
    assert.equal(q('.bcard').dataset.morph, 'open', 'the pill changes into the card');
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
    document.querySelector('.bf-round[data-act="stop"]').click();
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
    document.querySelector('.bf-round[data-act="stop"]').click();
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
    document.querySelector('.bf-round[data-act="expand"]').click();
    assert.equal(card.zoomed, false);
    assert.equal(root.getAttribute('data-browser-panel'), 'panel');
    document.querySelector('.bf-head > .bf-icon:last-child').click();
    assert.equal(root.getAttribute('data-browser-panel'), null);
    assert.equal(document.querySelector('.bf'), null);
    assert.equal(card.view, 'front', 'opened from the card, the room is given back and the card stays');
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

test('a question of the server shows its panel under the card, which stays; the answer goes out once; the server saying it is over takes the panel away', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push([id, payload]) });
  w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'shop.example', label: 'x' });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'confirm', action: 'payment', domain: 'shop.example', summary: 'Pay 12 dollars' });
  const root = w.card.element;
  assert.equal(root.querySelector('.bcard-card').hidden, false, 'the preview card stays');
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

test('a question while the card is a pill: the pill stays and says it needs you, the question is under it; deleting is red; a kind that is not known leaves the card alone', () => {
  const w = make();
  w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'a.example', label: 'x' });
  w.card.element.querySelector('.bcard-round').click(); // to a pill
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-2', kind: 'confirm', action: 'delete', domain: 'a.example', summary: 'Delete the file' });
  const root = w.card.element;
  assert.equal(root.querySelector('.bcard-pill').hidden, false, 'the pill stays');
  assert.equal(root.querySelector('.bcard-card').hidden, true);
  assert.equal(root.querySelector('.bcard-panel').hidden, false);
  assert.ok(root.querySelector('.bcard-pill .bcard-icon.is-help'), 'the yellow triangle');
  assert.ok(root.querySelector('.bpanel-button.is-danger'));
  const w2 = make();
  w2.card.handle({ type: 'browser', event: 'ask', id: 'ask-3', kind: 'unknown-kind' });
  assert.equal(w2.card.element.querySelector('.bcard-panel').hidden, true);
});

test('an answer that does not get through (not sent, the reply not running any more, already answered) puts the question back with a line that says so', async () => {
  for (const [result, wanted] of [[() => Promise.resolve({ ok: false, status: 0 }), /try again/i], [() => Promise.resolve({ ok: false, status: 404 }), /interrupted/i], [() => Promise.resolve({ ok: true, status: 200, data: { ok: true, answered: false } }), /interrupted/i], [() => Promise.reject(new Error('x')), /try again/i]]) {
    const answers = [];
    const w = make({ onAnswer: (id, payload) => { answers.push([id, payload]); return result(); } });
    w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'shop.example', label: 'x' });
    w.card.handle({ type: 'browser', event: 'ask', id: 'ask-9', kind: 'confirm', action: 'irreversible', domain: 'shop.example', summary: 'Send the file' });
    const root = w.card.element;
    root.querySelectorAll('.bpanel-button')[1].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const line = root.querySelector('.bpanel-error');
    assert.ok(line, 'a line says it did not go');
    assert.match(line.textContent, wanted);
    assert.equal(root.querySelector('.bcard-panel').hidden, false);
    const [, again] = root.querySelectorAll('.bpanel-button');
    assert.equal(again.disabled, false, 'the buttons work again');
    again.click();
    assert.equal(answers.length, 2, 'a second try goes out');
  }
  const ok = make({ onAnswer: () => Promise.resolve({ ok: true, status: 200, data: { ok: true, answered: true } }) });
  ok.card.handle({ type: 'browser', event: 'ask', id: 'ask-8', kind: 'confirm', action: 'delete', domain: 'a.example', summary: 'x' });
  ok.card.element.querySelectorAll('.bpanel-button')[1].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(ok.card.element.querySelector('.bpanel-error'), null);
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
  [...w2.card.element.querySelectorAll('.bpanel-link')].find((b) => b.textContent === 'Use another way').click();
  assert.deepEqual(answers.at(-1), { method: 'other' });
});

test('the code panel: asking for the code again is possible only after a short wait, which counts down', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push(payload) });
  w.card.handle({ type: 'browser', event: 'ask', id: 'ask-1', kind: 'code', domain: 'github.com', digits: 6 });
  const resend = [...w.card.element.querySelectorAll('.bpanel-link')].find((b) => /30 s/.test(b.textContent));
  assert.ok(resend, 'the wait is shown');
  assert.equal(resend.disabled, true);
  resend.click();
  assert.deepEqual(answers, [], 'not before the wait is over');
  t.mock.timers.tick(10_000);
  assert.match(resend.textContent, /20 s/);
  t.mock.timers.tick(20_000);
  assert.equal(resend.disabled, false);
  assert.equal(resend.textContent, 'Did not get it? Ask the AI to send it again');
  resend.click(); resend.click();
  assert.deepEqual(answers, [{ method: 'resend' }]);
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

test('until the first picture arrives the card says it is loading; with the first frame the live picture takes its place', async () => {
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    const source = { mount(el) { const video = el.ownerDocument.createElement('video'); el.append(video); }, mountLens() {}, destroy() {}, input: {} };
    card.setLive({ source, controller: {}, tabs: [] });
    assert.equal(q('.bcard-screen').hidden, false, 'not a black card');
    assert.ok(q('.bcard-screen').classList.contains('is-loading'));
    assert.equal(q('.bcard-site').textContent, 'Connecting the screen…');
    q('.bl-picture video').dispatchEvent(new window.Event('playing'));
    assert.ok(q('.bcard-screen').classList.contains('is-fading'), 'the loading look fades away first');
    assert.equal(q('.bcard-screen').hidden, false);
    await new Promise((resolve) => setTimeout(resolve, 320));
    assert.equal(q('.bcard-screen').hidden, true);
    assert.equal(q('.bcard-screen').classList.contains('is-loading'), false);
  } finally {
    window.happyDOM.abort();
  }
});

test('a saved message draws the tag of the browser work from its record: done, cancelled, failed; a press opens the card and the capsule turns it to the steps', async () => {
  const { browserTagElement } = await import('../src/app/ui/sandbox/browser-tag.js');
  for (const [end, expectPhase] of [['done', 'done'], ['cancelled', 'cancelled'], ['failed', 'failed']]) {
    const window = new Window();
    const { document } = window;
    try {
      const host = browserTagElement(document, { end, steps: [{ action: 'open', domain: 'acme.com', label: 'Browsing: acme.com' }, { action: 'click', domain: 'acme.com', label: 'Working in acme.com' }] }, { language: 'en' });
      document.body.append(host);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const root = host.querySelector('.bcard');
      assert.equal(root.dataset.phase, expectPhase);
      assert.equal(root.dataset.view, 'pill', 'it is folded into its tag');
      host.querySelector('.bcard-pill').click();
      assert.equal(root.dataset.view, 'front');
      host.querySelector('.bcard-capsule').click();
      assert.equal(host.querySelectorAll('.bcard-step').length, 2);
    } finally {
      window.happyDOM.abort();
    }
  }
});

test('the last picture of a saved message is the screen of the opened tag; a data address that is not a small JPEG is not taken', async () => {
  const { normalizeBrowserRecord } = await import('../src/app/ui/sandbox/sandbox-run-block.js');
  const steps = [{ action: 'open', domain: 'acme.com', label: 'Browsing: acme.com' }];
  assert.equal(normalizeBrowserRecord({ end: 'done', steps, frame: 'https://evil.example/x.jpg' }).frame, undefined);
  assert.equal(normalizeBrowserRecord({ end: 'done', steps, frame: 'data:image/svg+xml;base64,AAAA' }).frame, undefined);
  assert.equal(normalizeBrowserRecord({ end: 'done', steps, frame: `data:image/jpeg;base64,${'A'.repeat(70_000)}` }).frame, undefined);
  const frame = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  assert.equal(normalizeBrowserRecord({ end: 'done', steps, frame }).frame, frame);
  const { browserTagElement } = await import('../src/app/ui/sandbox/browser-tag.js');
  const window = new Window();
  const { document } = window;
  try {
    const host = browserTagElement(document, { end: 'done', steps, frame }, { language: 'en' });
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 20));
    host.querySelector('.bcard-pill').click();
    const still = host.querySelector('.bcard-still');
    assert.equal(still.hidden, false);
    assert.equal(still.getAttribute('src'), frame);
    assert.equal(host.querySelector('.bcard-screen').hidden, true, 'the place holder goes');
  } finally {
    window.happyDOM.abort();
  }
});

test('the card has the loading look (the flowing cream purple) while the browser starts and until the first picture; a saved tag does not', () => {
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.ok(q('.bcard-screen').classList.contains('is-loading'), 'no picture yet');
    assert.equal(q('.bcard-site').textContent, 'Starting the browser…', 'the browser is still starting');
    card.complete();
    assert.equal(q('.bcard-screen').classList.contains('is-loading'), false, 'the work is over: a quiet place holder');
  } finally {
    window.happyDOM.abort();
  }
});

const planEvent = (...tasks) => ({ type: 'browser', event: 'plan', tasks: tasks.map(([text, status]) => ({ text, status })) });

test('the work list takes the place of the steps in the list: done ticked, the one in hand turning, the rest dim; a new list from the model replaces what is not done', () => {
  const { window, card, steps } = make();
  try {
    card.handle(planEvent(['Open the shop', 'doing'], ['Pick shoes', 'todo']));
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.deepEqual(steps().map((row) => row.textContent), ['Open the shop', 'Pick shoes'], 'the steps of the browser are not listed when there is a list of tasks');
    assert.deepEqual(steps().map((row) => row.className.replace('bcard-step ', '')), ['is-run', 'is-todo']);
    card.handle(call('click', 'acme.com', 'Working the browser on acme.com'));
    assert.equal(steps().length, 2, 'more steps of the browser do not turn the task in hand into a done one');
    assert.ok(steps()[0].classList.contains('is-run'));
    card.handle(planEvent(['Open the shop', 'done'], ['Compare two pairs', 'doing'], ['Tell the user', 'todo']));
    assert.deepEqual(steps().map((row) => row.className.replace('bcard-step ', '')), ['is-done', 'is-run', 'is-todo']);
    card.complete();
    assert.deepEqual(steps().map((row) => row.className.replace('bcard-step ', '')), ['is-done', 'is-done', 'is-todo'], 'what was in hand is done at the end; what was never begun stays as it was');
  } finally {
    window.happyDOM.abort();
  }
});

test('stopped: the task in hand is marked stopped, what was done stays done; with no list the steps are listed as before', () => {
  const { window, card, steps } = make({ onCancel: () => {} });
  try {
    card.handle(planEvent(['Open the shop', 'done'], ['Pick shoes', 'doing'], ['Pay', 'todo']));
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.cancel();
    assert.deepEqual(steps().map((row) => row.className.replace('bcard-step ', '')), ['is-done', 'is-fail', 'is-todo']);
  } finally {
    window.happyDOM.abort();
  }
  const plain = make();
  try {
    plain.card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.deepEqual(plain.steps().map((row) => row.textContent), ['Browsing: acme.com']);
  } finally {
    plain.window.happyDOM.abort();
  }
});

test('a list written but never followed by the browser leaves no card behind', () => {
  const { window, card, q } = make();
  try {
    card.handle(planEvent(['Look it up', 'doing']));
    card.complete();
    assert.equal(q('.bcard').hidden, true);
  } finally {
    window.happyDOM.abort();
  }
});

test('the record keeps the list (short, at most twelve, a known state each) and the saved tag shows it when it is opened', async () => {
  const { normalizeBrowserRecord } = await import('../src/app/ui/sandbox/sandbox-run-block.js');
  const steps = [{ action: 'open', domain: 'acme.com', label: 'Browsing: acme.com' }];
  const plan = [{ text: 'Open the shop', status: 'done' }, { text: ` ${'x'.repeat(300)} `, status: 'weird' }, { text: '', status: 'done' }, ...Array.from({ length: 20 }, (_, index) => ({ text: `T${index}`, status: 'todo' }))];
  const record = normalizeBrowserRecord({ end: 'done', steps, plan });
  assert.equal(record.plan.length, 12);
  assert.equal(record.plan[1].text.length, 120);
  assert.equal(record.plan[1].status, 'todo');
  assert.equal(normalizeBrowserRecord({ end: 'done', steps }).plan, undefined);
  const { browserTagElement } = await import('../src/app/ui/sandbox/browser-tag.js');
  const window = new Window();
  const { document } = window;
  try {
    const host = browserTagElement(document, { end: 'done', steps, plan: [{ text: 'Open the shop', status: 'done' }, { text: 'Pick shoes', status: 'doing' }, { text: 'Pay', status: 'todo' }] }, { language: 'en' });
    document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual([...host.querySelectorAll('.bcard-step')].map((row) => row.className.replace('bcard-step ', '')), ['is-done', 'is-done', 'is-todo']);
  } finally {
    window.happyDOM.abort();
  }
});

test('what the person adds while the browser works is a line of the list (under the tasks or the steps), and is kept in the record and shown in the saved tag', async () => {
  const { window, card, steps } = make();
  try {
    card.handle(planEvent(['Search', 'doing']));
    card.handle({ type: 'browser', event: 'steer', id: 'a', text: '  not that\nairline ' });
    assert.deepEqual(steps().map((row) => row.textContent), ['Search', 'You added: not that airline']);
    assert.ok(steps()[1].classList.contains('is-note'));
  } finally {
    window.happyDOM.abort();
  }
  const { normalizeBrowserRecord } = await import('../src/app/ui/sandbox/sandbox-run-block.js');
  const stepsRecord = [{ action: 'open', domain: 'acme.com', label: 'Browsing: acme.com' }];
  const record = normalizeBrowserRecord({ end: 'done', steps: stepsRecord, steers: [{ text: 'not that airline', at: 3 }, { text: '', at: 1 }, ...Array.from({ length: 30 }, (_, index) => ({ text: `s${index}`, at: index }))] });
  assert.equal(record.steers.length, 20);
  assert.deepEqual(record.steers[0], { text: 'not that airline', at: 3 });
  const { browserTagElement } = await import('../src/app/ui/sandbox/browser-tag.js');
  const view = new Window();
  try {
    const host = browserTagElement(view.document, { end: 'done', steps: stepsRecord, steers: [{ text: 'not that airline', at: 1 }] }, { language: 'en' });
    view.document.body.append(host);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual([...host.querySelectorAll('.bcard-step')].map((row) => row.textContent), ['Browsing: acme.com', 'You added: not that airline']);
  } finally {
    view.happyDOM.abort();
  }
});

test('a card that failed works again when the model goes on (a browser lost, another opened, or a step that failed once): the picture is connected afresh and the work goes on in the same card', () => {
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.handle({ type: 'browser', event: 'failed', label: 'The browser is not available' });
    assert.equal(q('.bcard').dataset.phase, 'failed');
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.equal(q('.bcard').dataset.phase, 'run');
    assert.equal(card.view, 'front');
    assert.equal(q('.bcard-capsule .bcard-text').textContent, 'Browsing: acme.com');
  } finally {
    window.happyDOM.abort();
  }
});

test('a screen that is told again is looked at through one connection: the one before is let go before the next is made, and with the card', async () => {
  const window = new Window();
  const { document } = window;
  const log = [];
  let made = 0;
  try {
    const ledger = createSandboxLedger({ document, host: document.body, language: 'en', summary: true, onBrowserLive: async (card, sessionId) => { made += 1; const n = made; log.push(`connect ${n} ${sessionId}`); return { stop: () => { log.push(`stop ${n}`); } }; } });
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    ledger.event({ type: 'browser', event: 'live', sessionId: 'b1' });
    ledger.event({ type: 'browser', event: 'live', sessionId: 'b1' });
    ledger.event({ type: 'browser', event: 'live', sessionId: 'b1' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(log, ['connect 1 b1', 'stop 1', 'connect 2 b1', 'stop 2', 'connect 3 b1'], 'never two at once');
    ledger.remove();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(log.at(-1), 'stop 3', 'and the last one goes with the card');
  } finally {
    window.happyDOM.abort();
  }
});

test('a browser that is ready before the model uses it: the screen is joined out of sight, the card shows with the first step; when no step comes the card stays away and the screen is let go', async () => {
  const window = new Window();
  const { document } = window;
  const log = [];
  try {
    const ledger = createSandboxLedger({ document, host: document.body, language: 'en', summary: true, onBrowserLive: async (card, sessionId) => { log.push(`connect ${sessionId}`); return { stop: () => { log.push('stop'); } }; } });
    ledger.event({ type: 'browser', event: 'warm', sessionId: 'b1' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(log, ['connect b1'], 'joined at once');
    const root = () => document.body.querySelector('.bcard');
    assert.ok(!root() || root().hidden, 'but nothing is on the screen');
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(root() && !root().hidden, 'the first step shows the card');
    assert.deepEqual(log, ['connect b1'], 'and the screen is not joined twice');
  } finally {
    window.happyDOM.abort();
  }
  const quiet = new Window();
  const calm = [];
  try {
    const ledger = createSandboxLedger({ document: quiet.document, host: quiet.document.body, language: 'en', summary: true, onBrowserLive: async (card, sessionId) => { calm.push(`connect ${sessionId}`); return { stop: () => { calm.push('stop'); } }; } });
    ledger.event({ type: 'browser', event: 'warm', sessionId: 'b1' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    ledger.complete?.();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const root = quiet.document.body.querySelector('.bcard');
    assert.ok(!root || root.hidden, 'the model never used it: no card');
  } finally {
    quiet.happyDOM.abort();
  }
});

test('the server says the person ended the browser (another page, or this one): the card is the tag "Stopped", and the server is not told again', () => {
  let cancelled = 0;
  const { window, card, q } = make({ onCancel: () => { cancelled += 1; } });
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.handle({ event: 'ended' });
    assert.equal(card.phase, 'cancelled');
    assert.equal(q('.bcard-pill .bcard-text').textContent, 'Stopped');
    assert.equal(cancelled, 0, 'the end came from the server: nothing is sent back');
    card.handle({ event: 'ended' });
    assert.equal(cancelled, 0);
  } finally {
    window.happyDOM.abort();
  }
});

test('the server ends the browser: the process list lets go of the screen, and the card is stopped without asking the server again', async () => {
  const window = new Window();
  try {
    const { document } = window;
    let cancelled = 0;
    const stopped = [];
    const ledger = createSandboxLedger({ document, host: document.body, language: 'en', summary: true, onBrowserCancel: () => { cancelled += 1; }, onBrowserLive: async () => ({ stop: () => stopped.push('stop') }) });
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    ledger.event({ type: 'browser', event: 'live', sessionId: 'b1' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    ledger.event({ type: 'browser', event: 'ended' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(document.body.querySelector('.bcard').dataset.phase, 'cancelled');
    assert.deepEqual(stopped, ['stop'], 'the connection to the screen is let go');
    assert.equal(cancelled, 0);
  } finally {
    window.happyDOM.abort();
  }
});

test('the cross of the card lets go of the screen at once and asks the server to end only the browser', async () => {
  const window = new Window();
  try {
    const { document } = window;
    let cancelled = 0;
    const stopped = [];
    const ledger = createSandboxLedger({ document, host: document.body, language: 'en', summary: true, onBrowserCancel: () => { cancelled += 1; }, onBrowserLive: async () => ({ stop: () => stopped.push('stop') }) });
    ledger.event(call('open', 'acme.com', 'Browsing: acme.com'));
    ledger.event({ type: 'browser', event: 'live', sessionId: 'b1' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    document.body.querySelector('.bcard-buttons .bcard-round[aria-label="Cancel the task"]').click();
    document.body.querySelector('.bcard-dialog-button.is-danger').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(cancelled, 1);
    assert.deepEqual(stopped, ['stop']);
  } finally {
    window.happyDOM.abort();
  }
});

test('fifteen minutes before the time of the task is up the capsule says so for a while and the list keeps it; when the time is up the card is the tag "Closed (time is up)"', async () => {
  const { window, card, q } = make({ onCancel: () => { throw new Error('the server is not told'); } });
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.handle({ event: 'timeleft', minutes: 15 });
    assert.match(q('.bcard-capsule .bcard-text').textContent, /15 min left/);
    card.handle({ event: 'timeup' });
    assert.equal(card.phase, 'cancelled');
    assert.equal(q('.bcard-pill .bcard-text').textContent, 'Closed (time is up)');
  } finally {
    window.happyDOM.abort();
  }
});

test('a failure with words of its own (closed for sitting idle) shows them; when the model opens another browser the card works again with the usual words', () => {
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.handle({ event: 'failed', label: 'Closed (idle for too long)' });
    assert.equal(card.phase, 'failed');
    assert.equal(q('.bcard-capsule .bcard-text').textContent, 'Closed (idle for too long)');
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    assert.equal(card.phase, 'run');
    card.handle({ event: 'failed' });
    assert.equal(q('.bcard-capsule .bcard-text').textContent, 'The browser is not available now');
  } finally {
    window.happyDOM.abort();
  }
});

test('from fifteen minutes before the end the capsule says what is being done and how much time is left, by turns; it stops when the task is over', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.handle({ event: 'timeleft', minutes: 15 });
    const text = () => q('.bcard-capsule .bcard-text').textContent;
    assert.match(text(), /15 min left/);
    t.mock.timers.tick(7500);
    assert.equal(text(), 'Browsing: acme.com', 'then the step in hand');
    t.mock.timers.tick(7500);
    assert.match(text(), /15 min left/, 'then the time again: a round of fifteen seconds');
    card.handle({ event: 'timeup' });
    assert.equal(card.phase, 'cancelled');
    t.mock.timers.tick(15000);
    assert.equal(q('.bcard-pill .bcard-text').textContent, 'Closed (time is up)', 'the turns stopped');
  } finally {
    window.happyDOM.abort();
  }
});

test('the browser is in another conversation: the panel says so with the longest wait, and the three choices go out once each as an answer', () => {
  const answers = [];
  const w = make({ onAnswer: (id, payload) => answers.push([id, payload]) });
  try {
    w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'shop.example', label: 'x' });
    w.card.handle({ type: 'browser', event: 'ask', id: 'ask-9', kind: 'busy', minutes: 13 });
    const root = w.card.element;
    assert.equal(root.querySelector('.bcard-panel').hidden, false);
    assert.equal(root.querySelector('.bpanel-title').textContent, 'The browser is in use in another conversation');
    assert.match(root.querySelector('.bpanel-hint').textContent, /At most about 13 min/);
    const [wait, stop] = root.querySelectorAll('.bpanel-button');
    stop.click(); wait.click(); root.querySelector('.bpanel-link').click();
    assert.deepEqual(answers, [['ask-9', { decision: 'stop' }]], 'one answer only');
  } finally {
    w.window.happyDOM.abort();
  }
});

test('the longest wait is not known: the panel says it is not certain', () => {
  const w = make({ onAnswer: () => {} });
  try {
    w.card.handle({ type: 'browser', event: 'call', action: 'open', domain: 'shop.example', label: 'x' });
    w.card.handle({ type: 'browser', event: 'ask', id: 'ask-9', kind: 'busy', minutes: 0 });
    assert.match(w.card.element.querySelector('.bpanel-hint').textContent, /not certain/);
  } finally {
    w.window.happyDOM.abort();
  }
});

test('the model\'s circle comes at the point the host gave for a click, goes after a moment, and is out of the way while the person holds the browser', async () => {
  const { window, card, q } = make();
  try {
    card.handle(call('open', 'acme.com', 'Browsing: acme.com'));
    card.setLive(fakeLive().live);
    const lens = q('.bl-lens');
    card.handle({ type: 'browser', event: 'point', action: 'click', x: 0.3, y: 0.7 });
    assert.equal(lens.hidden, false);
    assert.equal(lens.style.left, '30%');
    assert.equal(lens.style.top, '70%');
    assert.equal(lens.classList.contains('is-user'), false);
    // A point that is not on the screen is not drawn.
    card.handle({ type: 'browser', event: 'point', action: 'click', x: 2, y: 0.7 });
    assert.equal(lens.style.left, '30%');
    // The person takes the browser over: the model's circle goes, and a point of the model does not bring it back.
    card.liveState({ control: 'user' });
    assert.equal(lens.hidden, true);
    card.handle({ type: 'browser', event: 'point', action: 'click', x: 0.5, y: 0.5 });
    assert.equal(lens.hidden, true);
    // Their circle is on the screen while they point; given back, it goes, and the model's comes with its next step.
    card.moveCursor(0.4, 0.4, 'user');
    assert.equal(lens.hidden, false);
    assert.equal(lens.classList.contains('is-user'), true);
    card.liveState({ control: 'model' });
    assert.equal(lens.hidden, true);
    card.handle({ type: 'browser', event: 'point', action: 'type', x: 0.6, y: 0.2 });
    assert.equal(lens.hidden, false);
    assert.equal(lens.classList.contains('is-user'), false);
    await new Promise((resolve) => setTimeout(resolve, 2700));
    assert.equal(lens.hidden, true, 'the model\'s circle goes after a moment');
  } finally {
    window.happyDOM.abort();
  }
});
