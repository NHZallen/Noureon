import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { createFocusMode } from '../src/app/ui/browser-live/focus-mode.js';

const make = (options = {}) => {
  const window = new Window();
  const { document } = window;
  const calls = [];
  const controller = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  const input = { log: [], pointer(...a) { this.log.push(['pointer', ...a]); }, wheel(...a) { this.log.push(['wheel', ...a]); }, key(...a) { this.log.push(['key', ...a]); }, text(...a) { this.log.push(['text', ...a]); } };
  const source = { input, mount() {}, mountLens() {}, destroy() {} };
  const mode = createFocusMode({ document, language: 'en', source, controller, state: { domain: 'acme.com', tabs: [{ id: 'a', title: 'Acme', active: true }, { id: 'b', title: 'Google', active: false }] }, ...options });
  const q = (selector) => document.querySelector(selector);
  const click = (selector) => q(selector).click();
  const pointer = (type, id, x, y, at) => {
    const event = new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: id });
    Object.defineProperty(event, 'timeStamp', { value: at });
    q('.bf-pad').dispatchEvent(event);
  };
  return { window, document, calls, input, mode, q, click, pointer };
};

test('while the model works: the site, the tabs, Take over below and the row over the screen (the capsule, Expand, the cross that cancels); no pad, no tools', () => {
  const { window, mode, q, calls, click } = make();
  try {
    assert.equal(q('.bf-site').textContent, 'acme.com');
    assert.equal(q('.bf-status'), null, 'no line of words above the screen: it can sit lower');
    assert.equal(q('.bf-pad').hidden, true);
    assert.equal(q('.bf-tools').hidden, true);
    const buttons = [...document_buttons(q)].filter((node) => !node.hidden).map((node) => node.getAttribute('aria-label'));
    assert.deepEqual(buttons, ['Take over'], 'the Stop below is gone: the cross of the row cancels');
    click('.bf-round[data-act="stop"]');
    click('.bf-act.is-primary');
    assert.deepEqual(calls.map((c) => c[0]), ['onStop', 'onTakeOver']);
    assert.equal(mode.view.element.style.aspectRatio, '1024 / 768');
  } finally {
    window.happyDOM.abort();
  }
});
const document_buttons = (q) => q('.bf-actions').querySelectorAll('button');

test('the tabs: a press switches, the cross closes, the plus opens a new one; the active one is marked', () => {
  const { window, q, calls, document } = make();
  try {
    const tabs = [...document.querySelectorAll('.bf-tab')];
    assert.equal(tabs.length, 2);
    assert.ok(tabs[0].classList.contains('is-active'));
    tabs[1].querySelector('.bf-tab-label').click();
    tabs[1].querySelector('.bf-tab-close').click();
    q('.bf-tab-new').click();
    assert.deepEqual(calls, [['onSwitchTab', 'b'], ['onCloseTab', 'b'], ['onNewTab']]);
  } finally {
    window.happyDOM.abort();
  }
});

test('taking over: the pad, the tools and "Give back" appear, Stop and Take over go; the dot is a ring', () => {
  const { window, mode, q, click, calls } = make();
  try {
    mode.update({ control: 'user' });
    assert.equal(q('.bf-pad').hidden, false);
    assert.equal(q('.bf-tools').hidden, false);
    assert.ok(q('.bf-dot').classList.contains('is-user'));
    const visible = [...q('.bf-actions').querySelectorAll('button')].filter((node) => !node.hidden).map((node) => node.getAttribute('aria-label'));
    assert.deepEqual(visible, ['Give back to the model']);
    click('.bf-actions .is-primary:not([hidden])');
    assert.deepEqual(calls.at(-1), ['onGiveBack']);
    mode.update({ control: 'model' });
    assert.equal(q('.bf-pad').hidden, true);
  } finally {
    window.happyDOM.abort();
  }
});

test('the trackpad: a tap clicks where the circle is; a slide moves the circle (the person\'s one) and the browser', () => {
  const { window, mode, pointer, input } = make();
  try {
    mode.update({ control: 'user' });
    pointer('pointerdown', 1, 10, 10, 0);
    pointer('pointerup', 1, 10, 10, 100);
    assert.deepEqual(input.log.map((entry) => `${entry[0]}:${entry[3] ?? ''}`), ['pointer:down', 'pointer:up']);
    assert.equal(mode.view.cursor.by, 'user');
    input.log.length = 0;
    pointer('pointerdown', 2, 10, 10, 200);
    pointer('pointermove', 2, 30, 10, 220);
    pointer('pointerup', 2, 30, 10, 240);
    assert.ok(input.log.some((entry) => entry[0] === 'pointer' && entry[3] === 'move'));
    assert.ok(!input.log.some((entry) => entry[3] === 'down'), 'a slide is not a click');
  } finally {
    window.happyDOM.abort();
  }
});

test('the keyboard: long text is written first and sent in one go; the key row sends single keys; paste with the clipboard sends its text, without it opens the keyboard', async () => {
  const { window, mode, q, input, click } = make({ readClipboard: async () => 'from clipboard' });
  try {
    mode.update({ control: 'user' });
    assert.equal(q('.bf-kb').hidden, true);
    click('.bf-tool:nth-child(1)');
    assert.equal(q('.bf-kb').hidden, false);
    q('.bf-kb-field').value = '你好，世界';
    click('.bf-kb-send');
    assert.deepEqual(input.log.at(-1), ['text', '你好，世界']);
    assert.equal(q('.bf-kb-field').value, '');
    click('.bf-key');
    assert.deepEqual(input.log.slice(-2), [['key', 'Escape', true], ['key', 'Escape', false]]);
    click('.bf-tool:nth-child(2)');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(input.log.at(-1), ['text', 'from clipboard']);
  } finally {
    window.happyDOM.abort();
  }
  const second = make({ readClipboard: async () => { throw new Error('denied'); } });
  try {
    second.mode.update({ control: 'user' });
    second.click('.bf-tool:nth-child(2)');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(second.q('.bf-kb').hidden, false, 'the clipboard was refused: the keyboard of the page is the way');
  } finally {
    second.window.happyDOM.abort();
  }
});

test('the menu: back, screenshot for the model, copy address, and the ratios with the chosen one marked', () => {
  const { window, q, click, calls, document, mode } = make();
  try {
    click('.bf-top .bf-icon:last-child');
    const items = [...document.querySelectorAll('.bf-menu-item')].map((node) => node.getAttribute('aria-label'));
    assert.deepEqual(items, ['Back', 'Screenshot to the model', 'Copy address', '4:3', '16:9', 'Upright']);
    assert.equal(q('.bf-menu-ratio.is-on').getAttribute('aria-label'), '4:3');
    q('.bf-menu-item:nth-child(2)').click();
    assert.equal(q('.bf-menu'), null, 'the menu closes after a choice');
    assert.deepEqual(calls.at(-1), ['onScreenshot']);
    click('.bf-top .bf-icon:last-child');
    [...document.querySelectorAll('.bf-menu-ratio')].find((node) => node.getAttribute('aria-label') === '16:9').click();
    assert.deepEqual(calls.at(-1), ['onRatio', '16:9']);
    mode.update({ ratio: '16:9' });
    assert.equal(mode.view.element.style.aspectRatio, '1280 / 720');
  } finally {
    window.happyDOM.abort();
  }
});

test('the cross and "Expand" are told to the owner; when the work is over the buttons go (the cross of the row too)', () => {
  const { window, q, click, calls, mode } = make();
  try {
    click('.bf-top .bf-icon:first-child');
    click('.bf-round[data-act="expand"]');
    assert.deepEqual(calls.map((c) => c[0]), ['onClose', 'onExpand']);
    mode.update({ over: true });
    assert.ok([...q('.bf-actions').querySelectorAll('button')].every((node) => node.hidden));
    assert.equal(q('.bf-round[data-act="stop"]').hidden, true, 'nothing to cancel any more');
  } finally {
    window.happyDOM.abort();
  }
});

test('the row over the screen says what is done, with the state; a press on the capsule shows the steps over the screen and the cross hides them', () => {
  const { window, q, mode } = make();
  try {
    mode.update({ label: 'Browsing: acme.com', status: 'run', steps: [{ label: 'Browsing: acme.com', state: 'done' }, { label: 'Working in acme.com', state: 'run' }] });
    assert.equal(q('.bf-cap .bcard-text').textContent, 'Browsing: acme.com');
    assert.ok(q('.bf-cap .bcard-spin'), 'the ring turns while it runs');
    assert.equal(q('.bf-steps').hidden, true);
    q('.bf-cap').click();
    assert.equal(q('.bf-steps').hidden, false);
    assert.equal([...q('.bf-steps').querySelectorAll('.bf-step')].length, 2);
    q('.bf-steps-close').click();
    assert.equal(q('.bf-steps').hidden, true);
    mode.update({ status: 'done', label: 'Done', over: true });
    assert.ok(q('.bf-cap .bcard-icon').classList.contains('is-done'));
  } finally {
    window.happyDOM.abort();
  }
});

test('a press on the empty room leaves the focus mode, as the cross does; not while the browser is in the person\'s hands (there it is the trackpad), and not on a button', () => {
  const { window, q, calls, mode } = make();
  try {
    q('.bf').click();
    assert.deepEqual(calls.map((c) => c[0]), ['onClose'], 'the room');
    q('.bf-actions').click();
    assert.equal(calls.length, 2);
    q('.bf-site').click();
    q('.bf-cap').click();
    assert.equal(calls.length, 2, 'what is not empty does not leave');
    mode.update({ control: 'user' });
    q('.bf').click();
    assert.equal(calls.length, 2, 'the person has the browser');
  } finally {
    window.happyDOM.abort();
  }
});

test('the round button is Shrink (arrows inward) when the focus mode was opened from the card and Expand (arrows outward) when it was opened from the pill; each asks the owner for its own', () => {
  const { window, q, click, calls, mode } = make();
  try {
    assert.equal(q('.bf-round[data-act="expand"]').getAttribute('aria-label'), 'Expand', 'the pill is the default origin');
    click('.bf-round[data-act="expand"]');
    assert.deepEqual(calls.at(-1), ['onExpand']);
    mode.update({ origin: 'front' });
    assert.equal(q('.bf-round[data-act="expand"]'), null);
    assert.equal(q('.bf-round[data-act="shrink"]').getAttribute('aria-label'), 'Shrink to a pill');
    click('.bf-round[data-act="shrink"]');
    assert.deepEqual(calls.at(-1), ['onShrink']);
    const inward = q('.bf-round[data-act="shrink"] svg path').getAttribute('d');
    mode.update({ origin: 'pill' });
    assert.notEqual(q('.bf-round[data-act="expand"] svg path').getAttribute('d'), inward, 'another picture');
  } finally {
    window.happyDOM.abort();
  }
});
