import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { formatMoney, startOpenrouterRing } from '../src/app/ui/provider-quota/openrouter-ring.js';
import { OPENROUTER_TEXTS, openrouterText } from '../src/app/ui/provider-quota/openrouter-texts.js';
import { startProviderQuota } from '../src/app/ui/provider-quota/start-quota.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
const limited = (percent, extra = {}) => ({ ok: true, limit: 20, remaining: (20 * percent) / 100, usedPercent: 100 - percent, remainingPercent: percent, resetKind: 'monthly', spent: { total: 31.5, daily: 0.4, weekly: 2.1, monthly: 15 }, stale: false, ...extra });
const windows = (rolling, weekly, monthly) => ({ rolling: { remainingPercent: rolling, usedPercent: 100 - rolling, resetsAt: null }, weekly: { remainingPercent: weekly, usedPercent: 100 - weekly, resetsAt: null }, monthly: { remainingPercent: monthly, usedPercent: 100 - monthly, resetsAt: null } });

function page() {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<aside id="sidebar"><div class="flex-1 overflow-y-auto px-2"><div id="first-section"></div><button id="open-cli-store-btn"></button></div></aside><input id="openrouter-api-key-input-all">';
  return { window, document };
}

function setup({ key = 'sk-or-key', result = limited(25), language = 'en' } = {}) {
  const { window, document } = page();
  const state = { key, result, language, asked: [] };
  const usage = { get: async (apiKey, options) => { state.asked.push([apiKey, options]); return state.result; } };
  const timers = [];
  const ring = startOpenrouterRing({ document, getApiKey: () => state.key, getLanguage: () => state.language, usage, setTimer: (callback) => timers.push(callback) });
  return { window, document, state, ring, timers, el: () => document.getElementById('openrouter-quota-btn') };
}

test('a key with a limit shows one ring as full as what is left, with the mark of OpenRouter in the middle and no words', async () => {
  const { window, el } = setup({ result: limited(25) });
  try {
    await flush();
    assert.equal(el().hidden, false);
    assert.equal(el().textContent.trim(), '', 'no words on the page');
    assert.equal(el().querySelectorAll('.oq-or-mark .oq-or-line').length, 2);
    assert.equal(el().querySelectorAll('.oq-or-mark .oq-or-head').length, 2);
    const arc = el().querySelector('.oq-arc');
    const [length, circumference] = arc.getAttribute('stroke-dasharray').split(' ').map(Number);
    assert.equal(Math.round((length / circumference) * 100), 25);
    assert.equal(el().parentElement.id, 'provider-quota-row');
  } finally {
    window.happyDOM.abort();
  }
});

test('the tip says what is left, of what limit, when it starts again, and what was spent', async () => {
  const { window, el } = setup({ result: limited(25) });
  try {
    await flush();
    assert.match(el().title, /OpenRouter key limit/);
    assert.match(el().title, /25% left \(\$5\.00 of \$20\), resets monthly/);
    assert.match(el().title, /Spent: today \$0\.40, this week \$2\.10, this month \$15/);
    assert.match(el().title, /Tap to refresh/);
    assert.match(el().getAttribute('aria-label'), /25% left/);
  } finally {
    window.happyDOM.abort();
  }
});

test('a ring is amber under a fifth and red when the limit is used up', async () => {
  const low = setup({ result: limited(10) });
  const empty = setup({ result: limited(0) });
  try {
    await flush();
    assert.equal(low.el().querySelector('.oq-arc').classList.contains('is-low'), true);
    assert.equal(empty.el().querySelector('.oq-arc').classList.contains('is-empty'), true);
  } finally {
    low.window.happyDOM.abort();
    empty.window.happyDOM.abort();
  }
});

test('no ring without a key, with a key that has no limit, with a wrong key, or when the service does not answer', async () => {
  const noKey = setup({ key: '' });
  try {
    await flush();
    assert.equal(noKey.el().hidden, true);
    assert.equal(noKey.state.asked.length, 0);
  } finally {
    noKey.window.happyDOM.abort();
  }
  for (const reason of ['no-limit', 'invalid-key', 'unavailable']) {
    const { window, el } = setup({ result: { ok: false, reason } });
    try {
      await flush();
      assert.equal(el().hidden, true, reason);
    } finally {
      window.happyDOM.abort();
    }
  }
});

test('an answer kept from before is shown dimmed and says so', async () => {
  const { window, el } = setup({ result: limited(60, { stale: true }) });
  try {
    await flush();
    assert.equal(el().classList.contains('is-stale'), true);
    assert.match(el().title, /out of date/);
  } finally {
    window.happyDOM.abort();
  }
});

test('the ring comes with the key and goes without it; leaving the key box asks again; a tap asks at once', async () => {
  const { window, document, state, ring, timers, el } = setup({ key: '' });
  try {
    await flush();
    state.key = 'sk-or-new';
    await ring.sync();
    assert.equal(el().hidden, false);
    assert.equal(state.asked.at(-1)[0], 'sk-or-new');
    document.getElementById('openrouter-api-key-input-all').dispatchEvent(new window.Event('focusout', { bubbles: true }));
    assert.equal(timers.length, 1);
    timers[0]();
    await flush();
    el().click();
    await flush();
    assert.deepEqual(state.asked.at(-1)[1], { force: true });
    state.key = '';
    await ring.sync();
    assert.equal(el().hidden, true);
  } finally {
    window.happyDOM.abort();
  }
});

test('the tip follows the language', async () => {
  const { window, state, ring, el } = setup({ language: 'zh-TW' });
  try {
    await flush();
    assert.match(el().title, /剩 25%/);
    state.language = 'fr';
    await ring.sync();
    assert.match(el().title, /25 % restant/);
  } finally {
    window.happyDOM.abort();
  }
});

test('money is written short', () => {
  assert.equal(formatMoney(5), '$5.00');
  assert.equal(formatMoney(15), '$15');
  assert.equal(formatMoney(0.4), '$0.40');
  assert.equal(formatMoney(0.004), '$0.004');
  assert.equal(formatMoney(null), '–');
});

test('the words are the same in the five languages', () => {
  const keys = Object.keys(OPENROUTER_TEXTS.en).sort();
  for (const language of ['zh-TW', 'fr', 'ru', 'es']) assert.deepEqual(Object.keys(OPENROUTER_TEXTS[language]).sort(), keys, language);
  assert.equal(openrouterText('xx', 'daily'), 'resets daily');
});

test('the two providers stand side by side in one row above the Extensions entry, OpenCode first', async () => {
  const { window, document } = page();
  try {
    const answers = { 'oc-key': { ok: true, windows: windows(100, 90, 79), stale: false }, 'or-key': limited(40) };
    const keys = { 'opencode-go': 'oc-key', openrouter: 'or-key' };
    // The OpenRouter side is made to answer first: the order is the style's, not the order of the answers.
    globalThis.__fetches = 0;
    const real = globalThis.fetch;
    globalThis.fetch = async (url) => {
      globalThis.__fetches += 1;
      if (String(url).includes('openrouter.ai')) return { ok: true, status: 200, json: async () => ({ data: { limit: 20, limit_remaining: 8, limit_reset: null, usage: 12 } }) };
      return { ok: true, status: 200, json: async () => ({ usage: { rolling: { percent: 0 }, weekly: { percent: 10 }, monthly: { percent: 21 } } }) };
    };
    try {
      startProviderQuota({ document, getApiKeyForProvider: (provider) => keys[provider] || '', getLanguage: () => 'en' });
      await new Promise((resolve) => setTimeout(resolve, 40));
    } finally {
      globalThis.fetch = real;
    }
    const row = document.getElementById('provider-quota-row');
    assert.equal(row.children.length, 2);
    assert.deepEqual([...row.children].map((child) => child.id).sort(), ['opencode-quota-btn', 'openrouter-quota-btn']);
    assert.equal(document.getElementById('opencode-quota-btn').hidden, false);
    assert.equal(document.getElementById('openrouter-quota-btn').hidden, false);
    assert.equal(row.nextElementSibling.id, 'open-cli-store-btn');
    assert.equal(document.querySelectorAll('#provider-quota-row').length, 1);
    assert.equal(answers['or-key'].remainingPercent, 40);
  } finally {
    window.happyDOM.abort();
  }
});

test('with only an OpenRouter key and no limit, nothing is shown at all', async () => {
  const { window, document } = page();
  try {
    const real = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ data: { limit: null, limit_remaining: null, usage: 3 } }) });
    try {
      startProviderQuota({ document, getApiKeyForProvider: (provider) => (provider === 'openrouter' ? 'or-key' : ''), getLanguage: () => 'en' });
      await new Promise((resolve) => setTimeout(resolve, 40));
    } finally {
      globalThis.fetch = real;
    }
    assert.equal(document.getElementById('openrouter-quota-btn').hidden, true);
    assert.equal(document.getElementById('opencode-quota-btn').hidden, true);
  } finally {
    window.happyDOM.abort();
  }
});
