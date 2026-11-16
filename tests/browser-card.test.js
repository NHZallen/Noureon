import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createBrowserCard } from '../src/app/ui/sandbox/browser-card.js';
import { createSandboxLedger } from '../src/app/ui/sandbox/sandbox-ledger.js';

const call = (action, domain, label) => ({ type: 'browser', event: 'call', action, domain, label });
const make = (options = {}) => {
  const window = new Window();
  const { document } = window;
  const card = createBrowserCard({ document, host: document.body, language: 'en', ...options });
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
