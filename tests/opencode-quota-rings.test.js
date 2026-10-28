import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { RING_ORDER, relativeReset, startQuotaRings } from '../src/app/ui/opencode-quota/quota-rings.js';
import { QUOTA_TEXTS, quotaText } from '../src/app/ui/opencode-quota/quota-texts.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
const NOW = Date.parse('2026-10-27T08:00:00Z');
const windows = (rolling, weekly, monthly) => ({
  rolling: { usedPercent: 100 - rolling, remainingPercent: rolling, resetsAt: NOW + 3 * 3_600_000, status: 'ok' },
  weekly: { usedPercent: 100 - weekly, remainingPercent: weekly, resetsAt: NOW + 2 * 86_400_000, status: 'ok' },
  monthly: { usedPercent: 100 - monthly, remainingPercent: monthly, resetsAt: NOW + 20 * 86_400_000, status: 'ok' }
});

function setup({ key = 'oc-key', result = { ok: true, windows: windows(100, 100, 79), stale: false }, language = 'en', withEntry = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = `<aside id="sidebar"><div class="flex-1 overflow-y-auto px-2"><div id="first-section"></div>${withEntry ? '<button id="open-cli-store-btn"></button>' : ''}</div></aside><input id="opencode-go-api-key-input">`;
  const state = { key, result, language, asked: [] };
  const usage = { get: async (apiKey, options) => { state.asked.push([apiKey, options]); return state.result; } };
  const timers = [];
  const rings = startQuotaRings({ document, getApiKey: () => state.key, getLanguage: () => state.language, usage, now: () => NOW, setTimer: (callback) => timers.push(callback) });
  return { window, document, state, rings, timers, el: () => document.getElementById('opencode-quota-btn') };
}

test('the rings are in the row above the Extensions entry', async () => {
  const { window, document, el } = setup();
  try {
    await flush();
    const row = el().parentElement;
    assert.equal(row.id, 'provider-quota-row');
    assert.equal(row.nextElementSibling.id, 'open-cli-store-btn');
    assert.equal(el().hidden, false);
    assert.equal(document.querySelector('#sidebar .overflow-y-auto').contains(el()), true);
  } finally {
    window.happyDOM.abort();
  }
});

test('the row stays above the entry when the entry comes after it', async () => {
  const { window, document, el } = setup({ withEntry: false });
  try {
    await flush();
    const row = el().parentElement;
    assert.equal(row.parentElement.firstElementChild, row);
    const entry = document.createElement('button');
    entry.id = 'open-cli-store-btn';
    const list = document.querySelector('#sidebar .overflow-y-auto');
    list.insertBefore(entry, list.firstChild);
    await flush();
    assert.equal(row.nextElementSibling, entry);
  } finally {
    window.happyDOM.abort();
  }
});

test('three rings, the 5 hours inside and the month outside, each as long as what is left', async () => {
  const { window, el } = setup({ result: { ok: true, windows: windows(100, 40, 79), stale: false } });
  await flush();
  assert.deepEqual([...RING_ORDER], ['rolling', 'weekly', 'monthly']);
  const radii = RING_ORDER.map((name) => Number(el().querySelector(`[data-window="${name}"] .oq-arc`).getAttribute('r')));
  assert.ok(radii[0] < radii[1] && radii[1] < radii[2], `inside out: ${radii}`);
  const filled = (name) => {
    const arc = el().querySelector(`[data-window="${name}"] .oq-arc`);
    const [length, circumference] = arc.getAttribute('stroke-dasharray').split(' ').map(Number);
    return Math.round((length / circumference) * 100);
  };
  assert.equal(filled('rolling'), 100);
  assert.equal(filled('weekly'), 40);
  assert.equal(filled('monthly'), 79);
  window.happyDOM.abort();
});

test('there are no words on the page, they are in the tip, which says when each starts again', async () => {
  const { window, el } = setup();
  await flush();
  assert.equal(el().textContent.trim(), '');
  assert.equal(el().querySelectorAll('.oq-line').length, 0);
  assert.match(el().title, /OpenCode Go usage/);
  assert.match(el().title, /5 hours: 100% left, resets in 3 hours/);
  assert.match(el().title, /This week: 100% left, resets in 2 days/);
  assert.match(el().title, /This month: 79% left, resets in 20 days/);
  assert.match(el().getAttribute('aria-label'), /This month: 79% left/);
  window.happyDOM.abort();
});

test('the mark of OpenCode is in the middle, inside the inner ring', async () => {
  const { window, el } = setup();
  await flush();
  assert.equal(el().querySelectorAll('.oq-mark path').length, 2);
  const inner = Number(el().querySelector('[data-window="rolling"] .oq-arc').getAttribute('r'));
  const transform = el().querySelector('.oq-mark').getAttribute('transform');
  const [, x, y, scale] = /translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/.exec(transform).map(Number);
  // The corners of the mark (240 by 300 units) are nearer the middle than the inside of the inner ring.
  const corner = Math.hypot(x + 240 * scale - 50, y + 300 * scale - 50);
  assert.ok(corner < inner - 4.5, `corner ${corner} inner ${inner}`);
  window.happyDOM.abort();
});

test('a ring is amber under a fifth and red when it is used up', async () => {
  const { window, el } = setup({ result: { ok: true, windows: windows(10, 0, 79), stale: false } });
  await flush();
  assert.equal(el().querySelector('[data-window="rolling"] .oq-arc').classList.contains('is-low'), true);
  assert.equal(el().querySelector('[data-window="weekly"] .oq-arc').classList.contains('is-empty'), true);
  assert.equal(el().querySelector('[data-window="monthly"] .oq-arc').classList.contains('is-low'), false);
  window.happyDOM.abort();
});

test('a window the answer does not have has no ring', async () => {
  const { window, el } = setup({ result: { ok: true, windows: { monthly: windows(1, 1, 50).monthly }, stale: false } });
  await flush();
  assert.doesNotMatch(el().title, /This week/);
  assert.equal(el().querySelector('[data-window="weekly"]').style.display, 'none');
  window.happyDOM.abort();
});

test('nothing shows without a key, or when the service does not answer', async () => {
  const noKey = setup({ key: '' });
  await flush();
  assert.equal(noKey.el().hidden, true);
  assert.equal(noKey.state.asked.length, 0);
  noKey.window.happyDOM.abort();
  for (const result of [{ ok: false, reason: 'unavailable' }, { ok: false, reason: 'invalid-key' }, { ok: false, reason: 'no-plan' }]) {
    const { window, el } = setup({ result });
    await flush();
    assert.equal(el().hidden, true, result.reason);
    window.happyDOM.abort();
  }
});

test('an answer kept from before is shown dimmed and says so', async () => {
  const { window, el } = setup({ result: { ok: true, windows: windows(50, 50, 50), stale: true } });
  await flush();
  assert.equal(el().classList.contains('is-stale'), true);
  assert.match(el().title, /out of date/);
  window.happyDOM.abort();
});

test('the rings come back when the key is added, and go when it is removed', async () => {
  const { window, state, rings, el } = setup({ key: '' });
  await flush();
  assert.equal(el().hidden, true);
  state.key = 'oc-new';
  await rings.sync();
  assert.equal(el().hidden, false);
  assert.equal(state.asked.at(-1)[0], 'oc-new');
  state.key = '';
  await rings.sync();
  assert.equal(el().hidden, true);
  window.happyDOM.abort();
});

test('leaving the key box asks again a moment later, and a tap asks at once', async () => {
  const { window, document, state, timers, el } = setup();
  await flush();
  const before = state.asked.length;
  document.getElementById('opencode-go-api-key-input').dispatchEvent(new window.Event('focusout', { bubbles: true }));
  assert.equal(timers.length, 1);
  timers[0]();
  await flush();
  assert.equal(state.asked.length, before + 1);
  el().click();
  await flush();
  assert.deepEqual(state.asked.at(-1)[1], { force: true });
  window.happyDOM.abort();
});

test('the tip follows the language', async () => {
  const { window, state, rings, el } = setup({ language: 'zh-TW' });
  await flush();
  assert.match(el().title, /5 小時: 剩 100%/);
  state.language = 'fr';
  await rings.sync();
  assert.match(el().title, /5 heures: 100 % restant/);
  window.happyDOM.abort();
});

test('the time left is said in the language, and nothing for a time that has passed', () => {
  assert.equal(relativeReset('en', NOW + 3 * 3_600_000, NOW), 'in 3 hours');
  assert.equal(relativeReset('en', NOW + 20 * 60_000, NOW), 'in 20 minutes');
  assert.equal(relativeReset('en', NOW - 1000, NOW), '');
  assert.equal(relativeReset('en', null, NOW), '');
});

test('the five languages have the same words', () => {
  const keys = Object.keys(QUOTA_TEXTS.en).sort();
  for (const language of ['zh-TW', 'fr', 'ru', 'es']) assert.deepEqual(Object.keys(QUOTA_TEXTS[language]).sort(), keys, language);
  assert.equal(quotaText('xx', 'rolling'), '5 hours');
  assert.equal(quotaText('en', 'left', { percent: 7 }), '7% left');
});
