import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createSettingsOutputTranslatorControls } from '../src/app/runtime/legacy-core/settings-output-translator-controls.js';
import { createLegacyRuntimeConfigStore } from '../src/app/runtime/kernel/config-store.js';
import {
  DEFAULT_SEARCH_PROVIDER,
  getSearchProvider,
  normalizeSearchProvider,
  searchProviderLabel,
  searchSourceModel
} from '../src/app/runtime/kernel/search-provider.js';
import { normalizeLoadedLegacyConfig } from '../src/app/runtime/kernel/config-normalization.js';
import handler from '../api/tinyfish-search.js';

test('Tavily stays the search source unless TinyFish is chosen', () => {
  assert.equal(DEFAULT_SEARCH_PROVIDER, 'tavily');
  assert.equal(normalizeSearchProvider('tinyfish'), 'tinyfish');
  for (const value of [undefined, null, '', 'bing', 'TinyFish', 42]) assert.equal(normalizeSearchProvider(value), 'tavily');
  assert.equal(getSearchProvider({ searchProvider: 'tinyfish' }), 'tinyfish');
  assert.equal(getSearchProvider(undefined), 'tavily');
  assert.equal(searchProviderLabel('tinyfish'), 'TinyFish');
  assert.equal(searchProviderLabel('x'), 'Tavily');
  assert.deepEqual(searchSourceModel({ searchProvider: 'tinyfish' }), { id: 'tinyfish-search', name: 'TinyFish Search', provider: 'tinyfish' });
  assert.deepEqual(searchSourceModel({}), { id: 'tavily-search', name: 'Tavily Search', provider: 'tavily' });
});

test('a saved config keeps its search source, and one that never had one keeps using Tavily', () => {
  const defaults = createLegacyRuntimeConfigStore({ defaultModelId: 'm' }).getConfig();
  assert.equal(defaults.searchProvider, 'tavily');
  assert.ok('tinyfish' in defaults.apiKeys);
  const load = (savedConfig) => normalizeLoadedLegacyConfig({
    currentConfig: { ...defaults },
    savedConfig,
    models: [{ id: 'm', provider: 'gemini' }]
  }).searchProvider;
  assert.equal(load({ searchProvider: 'tinyfish' }), 'tinyfish');
  assert.equal(load({}), 'tavily', 'saved before there was a choice');
  assert.equal(load({ searchProvider: 'unknown' }), 'tavily');
});

test('the search source select and the TinyFish key are added to the settings, and only the chosen source shows its fields', () => {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = '<div><div><input id="openrouter-api-key-input-all"></div></div>';
  const elements = {};
  const controls = createSettingsOutputTranslatorControls({
    document,
    elements,
    config: { searchProvider: 'tavily', uiLanguage: 'en' },
    i18n: { en: {} },
    getOutputMode: () => 'typewriter',
    getCouncilTranslatorCandidates: () => [],
    getSingleTranslatorCandidates: () => [],
    getProviderLabel: (provider) => provider,
    getModelPriceLabel: () => '',
    modelSupportsVision: () => false,
    modelSupportsDocumentUpload: () => false,
    escapeHTML: (value) => value
  });

  controls.ensureCouncilTranslatorSettingsControls();
  const select = document.getElementById('search-provider-select');
  assert.ok(select, 'the select exists');
  assert.deepEqual([...select.options].map((option) => option.value), ['tavily', 'tinyfish']);
  assert.equal(elements.searchProviderSelect, select);
  assert.equal(elements.tinyfishApiKeyInput, document.getElementById('tinyfish-api-key-input'));
  assert.ok(elements.tinyfishApiKeyInput, 'the TinyFish key field exists');
  const block = (id) => document.getElementById(id).closest('div');
  assert.equal(block('search-provider-select').nextElementSibling, block('tavily-api-key-input'), 'the select is right above the Tavily key');
  assert.equal(block('tavily-search-depth-select').nextElementSibling, block('tinyfish-api-key-input'), 'the TinyFish key is right after the Tavily depth');
  const shown = (id) => document.getElementById(id).closest('div').style.display !== 'none';

  assert.deepEqual(['tavily-api-key-input', 'tavily-search-depth-select', 'tinyfish-api-key-input'].map(shown), [true, true, false]);
  select.value = 'tinyfish';
  select.dispatchEvent(new window.Event('change'));
  assert.deepEqual(['tavily-api-key-input', 'tavily-search-depth-select', 'tinyfish-api-key-input'].map(shown), [false, false, true]);
  select.value = 'tavily';
  controls.syncSearchProviderControls();
  assert.deepEqual(['tavily-api-key-input', 'tavily-search-depth-select', 'tinyfish-api-key-input'].map(shown), [true, true, false]);

  // Opening the settings again adds nothing twice.
  controls.ensureCouncilTranslatorSettingsControls();
  assert.equal(document.querySelectorAll('#search-provider-select').length, 1);
  assert.equal(document.querySelectorAll('#tinyfish-api-key-input').length, 1);
  window.happyDOM.abort();
});

const createResponse = () => {
  const response = {
    statusCode: 0,
    headers: {},
    body: undefined,
    status(code) { response.statusCode = code; return response; },
    setHeader(name, value) { response.headers[name] = value; },
    json(value) { response.body = JSON.stringify(value); return response; },
    end(value) { if (value !== undefined) response.body = value; return response; }
  };
  return response;
};

test('the TinyFish proxy turns the page\'s POST into TinyFish\'s GET with the key in a header', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([String(url), init]);
    return { status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ results: [{ title: 'T', url: 'https://example.org' }] }) };
  };
  try {
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer secret-key' },
      body: { query: 'hello world', domain_type: 'news', page: 1, language: 'en', location: '', evil: 'x', domain_type_extra: 'y' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.match(response.body, /example\.org/);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0][0]);
    assert.equal(url.origin, 'https://api.search.tinyfish.ai');
    assert.equal(url.searchParams.get('query'), 'hello world');
    assert.equal(url.searchParams.get('domain_type'), 'news');
    assert.equal(url.searchParams.get('page'), '1');
    assert.equal(url.searchParams.get('language'), 'en');
    assert.equal(url.searchParams.has('location'), false, 'empty values are left out');
    assert.equal(url.searchParams.has('evil'), false, 'only the known parameters are passed on');
    assert.equal(calls[0][1].method, 'GET');
    assert.deepEqual(calls[0][1].headers, { 'X-API-Key': 'secret-key' });
    assert.ok(!calls[0][0].includes('secret-key'), 'the key is not in the address');

    const badType = createResponse();
    await handler({ method: 'POST', headers: { authorization: 'Bearer k' }, body: JSON.stringify({ query: 'q', domain_type: 'images' }) }, badType);
    assert.equal(new URL(calls[1][0]).searchParams.has('domain_type'), false, 'a domain type it does not know is dropped');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the TinyFish proxy refuses what it cannot send on', async () => {
  const noKey = createResponse();
  await handler({ method: 'POST', headers: {}, body: { query: 'q' } }, noKey);
  assert.equal(noKey.statusCode, 401);

  const noQuery = createResponse();
  await handler({ method: 'POST', headers: { authorization: 'Bearer k' }, body: { query: '  ' } }, noQuery);
  assert.equal(noQuery.statusCode, 400);

  const wrongMethod = createResponse();
  await handler({ method: 'GET', headers: {} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, 'POST, OPTIONS');

  const preflight = createResponse();
  await handler({ method: 'OPTIONS', headers: {} }, preflight);
  assert.equal(preflight.statusCode, 204);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const failed = createResponse();
    await handler({ method: 'POST', headers: { authorization: 'Bearer k' }, body: { query: 'q' } }, failed);
    assert.equal(failed.statusCode, 502);
    assert.match(failed.body, /offline/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
