import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { getCouncilRuntimeTexts } from '../src/app/runtime/legacy-core/council-runtime-texts.js';
import { createToastCenter, noticeDuration } from '../src/app/ui/notifications/toast-center.js';

const setup = () => {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="notification-container"></div>';
  const container = document.getElementById('notification-container');
  const timers = [];
  const center = createToastCenter({
    document,
    getContainer: () => container,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => { if (timer) timer.cancelled = true; },
    getText: (key, fallback) => (key === 'close' ? 'Close' : fallback)
  });
  // Runs the timer that would fire next, as the clock reaching it would.
  const fire = () => {
    const next = timers.find((timer) => !timer.cancelled);
    assert.ok(next, 'a timer is pending');
    next.cancelled = true;
    next.callback();
  };
  const pending = () => timers.filter((timer) => !timer.cancelled);
  return { window, document, container, center, timers, fire, pending };
};

test('a notice is a line of text with an icon for its kind and a close button', () => {
  const { window, container, center } = setup();
  try {
    center.show('Saved');
    center.show('Could not save', 'error');
    const [saved, failed] = container.children;
    assert.equal(saved.textContent, 'Saved');
    assert.equal(saved.className, 'notification success');
    assert.ok(saved.querySelector('.notification-icon svg'));
    assert.equal(saved.getAttribute('role'), 'status');
    assert.equal(failed.getAttribute('role'), 'alert', 'a failure is announced at once');
    assert.equal(saved.querySelector('.notification-close').getAttribute('aria-label'), 'Close');
    assert.equal(saved.querySelector('.notification-action'), null, 'no button unless there is an action');
  } finally {
    window.close();
  }
});

test('short notices stay a moment, long ones up to twice that, and ones with a button longer still', () => {
  assert.equal(noticeDuration('Saved'), 3000);
  assert.equal(noticeDuration('x'.repeat(40)), 3000);
  assert.equal(noticeDuration('x'.repeat(60)), 3800);
  assert.equal(noticeDuration('x'.repeat(500)), 6000);
  assert.equal(noticeDuration('Saved', { hasAction: true }), 6000);
  const { window, center, timers } = setup();
  try {
    center.show('x'.repeat(60));
    assert.equal(timers.at(-1).delay, 3800);
  } finally {
    window.close();
  }
});

test('a notice leaves with a short move, then is gone', () => {
  const { window, container, center, fire } = setup();
  try {
    center.show('Saved');
    const notice = container.firstElementChild;
    fire();
    assert.equal(notice.classList.contains('is-leaving'), true);
    assert.equal(container.contains(notice), true, 'still there while it moves');
    fire();
    assert.equal(container.contains(notice), false);
    assert.equal(center.visibleCount, 0);
  } finally {
    window.close();
  }
});

test('the same notice shown again refreshes the one on screen instead of piling up', () => {
  const { window, container, center, pending } = setup();
  try {
    center.show('Saved');
    const first = container.firstElementChild;
    const before = pending()[0];
    center.show('Saved');
    center.show('Saved');
    assert.equal(container.children.length, 1);
    assert.equal(container.firstElementChild, first);
    assert.equal(before.cancelled, true, 'its time starts over');
    assert.equal(pending().length, 1);
    center.show('Saved', 'error');
    assert.equal(container.children.length, 2, 'the same words as another kind are another notice');
  } finally {
    window.close();
  }
});

test('three show at once and the rest wait their turn', () => {
  const { window, container, center, fire, pending } = setup();
  try {
    ['one', 'two', 'three', 'four', 'five'].forEach((text) => center.show(text));
    assert.deepEqual([...container.children].map((node) => node.textContent), ['one', 'two', 'three']);
    assert.equal(center.waitingCount, 2);
    fire();
    const leaving = pending().at(-1);
    leaving.cancelled = true;
    leaving.callback();
    assert.deepEqual([...container.children].map((node) => node.textContent), ['two', 'three', 'four'], 'one leaving lets the next in');
    assert.equal(center.waitingCount, 1);
  } finally {
    window.close();
  }
});

test('the pointer over a notice holds its time, and it is given what was left when the pointer goes', () => {
  const { window, container, center, pending } = setup();
  try {
    center.show('Saved');
    const notice = container.firstElementChild;
    const timer = pending()[0];
    notice.dispatchEvent(new window.Event('pointerenter'));
    assert.equal(timer.cancelled, true, 'the countdown stops');
    assert.equal(pending().length, 0);
    notice.dispatchEvent(new window.Event('pointerleave'));
    assert.equal(pending().length, 1);
    assert.ok(pending()[0].delay >= 1500, 'never less than a moment to read what is left');
  } finally {
    window.close();
  }
});

test('a click on a notice, or its close button, dismisses it', () => {
  const { window, container, center, fire } = setup();
  try {
    center.show('One');
    center.show('Two');
    const [one, two] = container.children;
    one.click();
    assert.equal(one.classList.contains('is-leaving'), true);
    two.querySelector('.notification-close').click();
    assert.equal(two.classList.contains('is-leaving'), true);
    fire();
    fire();
    assert.equal(container.children.length, 0);
  } finally {
    window.close();
  }
});

test('an action is one button that does its work and dismisses the notice, and the notice stays for it', () => {
  const { window, container, center, timers } = setup();
  try {
    let done = 0;
    center.show('Council does not search.', 'warning', { action: { label: 'Turn on Search', onClick: () => { done += 1; } } });
    const notice = container.firstElementChild;
    assert.equal(timers.at(-1).delay, 6000);
    const button = notice.querySelector('.notification-action');
    assert.equal(button.textContent, 'Turn on Search');
    assert.equal(notice.textContent.includes('Turn on Search'), true);
    button.click();
    assert.equal(done, 1);
    assert.equal(notice.classList.contains('is-leaving'), true);
    assert.equal(done, 1, 'a click on the button is not also a click on the notice');
  } finally {
    window.close();
  }
});

test('a missing container is an explicit failure', () => {
  const window = new Window({ url: 'https://example.test/' });
  try {
    const center = createToastCenter({ document: window.document, getContainer: () => null, setTimeout: () => 1, clearTimeout: () => {} });
    assert.throws(() => center.show('Unavailable'), TypeError);
  } finally {
    window.close();
  }
});

test('the council\'s search notice is one short sentence with a button, in every language', () => {
  const words = { 'zh-TW': 24, en: 60, fr: 60, ru: 60, es: 60 };
  for (const [language, longest] of Object.entries(words)) {
    const texts = getCouncilRuntimeTexts(language);
    assert.ok(texts.searchManualNotice.length <= longest, `${language} notice is short: ${texts.searchManualNotice}`);
    assert.ok(texts.searchManualAction.length > 0 && texts.searchManualAction.length <= 18, `${language} has a short button`);
  }
  assert.equal(getCouncilRuntimeTexts('zh-TW').searchManualNotice, '理事會不會自動搜尋網路。');
  assert.equal(getCouncilRuntimeTexts('zh-TW').searchManualAction, '開啟搜尋');
});
