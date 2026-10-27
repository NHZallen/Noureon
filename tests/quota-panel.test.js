import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { startProviderQuota } from '../src/app/ui/provider-quota/start-quota.js';
import { getQuotaPanel } from '../src/app/ui/provider-quota/quota-row.js';
import { quotaText, QUOTA_TEXTS } from '../src/app/ui/opencode-quota/quota-texts.js';

const flush = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup({ keys = { 'opencode-go': 'oc-key', openrouter: 'or-key' }, openrouter = { data: { limit: 20, limit_remaining: 7, limit_reset: 'monthly', usage: 13, usage_daily: 0.4, usage_weekly: 2.1, usage_monthly: 12.5 } }, language = 'en' } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  document.body.innerHTML = '<aside id="sidebar"><div class="flex-1 overflow-y-auto px-2"><button id="open-cli-store-btn"></button></div></aside>';
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('openrouter.ai')) return { ok: true, status: 200, json: async () => openrouter };
    return { ok: true, status: 200, json: async () => ({ usage: { rolling: { percent: 62, resetsAt: new Date(Date.now() + 3 * 3_600_000 + 60_000).toISOString() }, weekly: { percent: 8 }, monthly: { percent: 91 } } }) };
  };
  const state = { language };
  try {
    startProviderQuota({ document, getApiKeyForProvider: (provider) => keys[provider] || '', getLanguage: () => state.language });
    await flush();
  } finally {
    globalThis.fetch = real;
  }
  const panel = () => document.getElementById('provider-quota-panel');
  const rows = () => [...panel().querySelectorAll('.oq-seg')].map((part) => [part.querySelector('.oq-seg-name')?.textContent || '', part.querySelector('.oq-seg-val').textContent]);
  return { window, document, calls, state, panel, rows, oc: () => document.getElementById('opencode-quota-btn'), or: () => document.getElementById('openrouter-quota-btn') };
}

test('the panel is there but closed until a ring is tapped', async () => {
  const { window, panel, oc } = await setup();
  try {
    assert.ok(panel());
    assert.equal(panel().classList.contains('is-open'), false);
    assert.equal(panel().getAttribute('aria-hidden'), 'true');
    assert.equal(oc().getAttribute('aria-expanded'), 'false');
    assert.match(oc().title, /Tap for details/);
  } finally {
    window.happyDOM.abort();
  }
});

test('a tap on the OpenCode rings opens the panel with the three windows, a second tap closes it', async () => {
  const { window, panel, rows, oc } = await setup();
  try {
    oc().click();
    assert.equal(panel().classList.contains('is-open'), true);
    assert.equal(panel().getAttribute('aria-hidden'), 'false');
    assert.equal(oc().classList.contains('is-open'), true);
    assert.equal(oc().getAttribute('aria-expanded'), 'true');
    assert.deepEqual(rows(), [['5h', '38%'], ['1w', '92%'], ['1m', '9%']]);
    assert.equal(panel().querySelectorAll('.oq-seg').length, 3, 'one line: three parts side by side');
    oc().click();
    assert.equal(panel().classList.contains('is-open'), false);
    assert.equal(panel().getAttribute('aria-hidden'), 'true');
    assert.equal(oc().classList.contains('is-open'), false);
    assert.equal(oc().getAttribute('aria-expanded'), 'false');
    // The words stay while it closes (it fades out).
    assert.equal(rows().length, 3);
  } finally {
    window.happyDOM.abort();
  }
});

test('a tap on the OpenRouter ring opens the panel with what is left of the limit, in one line', async () => {
  const { window, panel, rows, or } = await setup();
  try {
    or().click();
    assert.equal(panel().classList.contains('is-open'), true);
    assert.deepEqual(rows(), [['', '35%'], ['', '$7.00 / $20']]);
  } finally {
    window.happyDOM.abort();
  }
});

test('a tap on the other ring changes what the panel says and who has it; one panel for both', async () => {
  const { window, document, panel, rows, oc, or } = await setup();
  try {
    oc().click();
    or().click();
    assert.equal(panel().classList.contains('is-open'), true);
    assert.equal(rows()[1][1], '$7.00 / $20');
    assert.equal(or().classList.contains('is-open'), true);
    assert.equal(oc().classList.contains('is-open'), false);
    assert.equal(document.querySelectorAll('#provider-quota-panel').length, 1);
    or().click();
    assert.equal(panel().classList.contains('is-open'), false);
  } finally {
    window.happyDOM.abort();
  }
});

test('opening the panel asks again, closing it does not', async () => {
  const { window, calls, oc } = await setup();
  const real = globalThis.fetch;
  try {
    let asked = 0;
    globalThis.fetch = async () => { asked += 1; return { ok: true, status: 200, json: async () => ({ usage: { rolling: { percent: 10 }, weekly: { percent: 10 }, monthly: { percent: 10 } } }) }; };
    oc().click();
    await flush();
    const afterOpen = asked;
    assert.ok(afterOpen >= 1, 'a tap that opens asks again (the first ask was a few seconds ago at most)');
    oc().click();
    await flush();
    assert.equal(asked, afterOpen);
    assert.ok(calls.length >= 1);
  } finally {
    globalThis.fetch = real;
    window.happyDOM.abort();
  }
});

test('the panel closes by itself when the ring it belongs to goes away', async () => {
  const keys = { 'opencode-go': 'oc-key', openrouter: 'or-key' };
  const { window, panel, oc, or } = await setup({ keys });
  try {
    or().click();
    assert.equal(panel().classList.contains('is-open'), true);
    keys.openrouter = '';
    // The ring asks for the key again when the page is shown again.
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    await flush();
    assert.equal(or().hidden, true);
    assert.equal(panel().classList.contains('is-open'), false);
    assert.equal(oc().hidden, false);
  } finally {
    window.happyDOM.abort();
  }
});

test('the panel follows the language', async () => {
  const { window, rows, oc } = await setup({ language: 'zh-TW' });
  try {
    oc().click();
    assert.deepEqual(rows(), [['5時', '38%'], ['週', '92%'], ['月', '9%']]);
  } finally {
    window.happyDOM.abort();
  }
});

test('the panel controller is one for the row, and the words of the tap are in the five languages', async () => {
  const { window, document } = await setup();
  try {
    assert.equal(getQuotaPanel(document), getQuotaPanel(document));
    for (const language of Object.keys(QUOTA_TEXTS)) assert.ok(QUOTA_TEXTS[language].toggle, language);
    assert.equal(quotaText('en', 'toggle'), 'Tap for details');
  } finally {
    window.happyDOM.abort();
  }
});
