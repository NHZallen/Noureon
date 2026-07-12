import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createProviderRequestSupport } from '../src/app/legacy-runtime/features/provider-request-support.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createResponse = ({
  ok = true,
  status = 200,
  jsonValue = { results: [{ title: 'Result', url: 'https://example.test' }] },
  textValue = JSON.stringify(jsonValue)
} = {}) => ({
  ok,
  status,
  async json() {
    return jsonValue;
  },
  async text() {
    return textValue;
  }
});

const createHarness = ({
  activeConversation = { isWebSearchEnabled: false },
  apiKeys = { tavily: 'tavily-key' },
  fetchImpl,
  modelUsesTavilySearch = () => false,
  getProxyAuthHeaders = async () => ({}),
  streamImpl,
  translatorModel = { id: 'translator', name: 'Translator' }
} = {}) => {
  const fetchCalls = [];
  const streamCalls = [];
  const timers = [];
  const support = createProviderRequestSupport({
    buildTavilySearchQuery: (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    formatTavilySearchPacket: (data, query, label) => `${label}: ${query}: ${data.results?.[0]?.title || 'none'}`,
    getErrorMessage: (body, fallback) => body?.error?.message || fallback,
    readErrorBody: async (response) => JSON.parse(await response.text()),
    getApiKeyForProvider: (provider) => apiKeys[provider] || '',
    getConfig: () => ({ tavilySearchDepth: 'advanced', uiLanguage: 'en' }),
    getActiveConversation: () => activeConversation,
    streamApiCall: streamImpl || (async (parts, onChunk, signal, isWebSearchForced, options = {}) => {
      streamCalls.push({ parts, signal, isWebSearchForced, options });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      onChunk?.('delta');
      return options.modelInfo?.id === 'translator' ? 'translated document' : 'provider response';
    }),
    fetchImpl: fetchImpl || (async (...args) => {
      fetchCalls.push(args);
      return createResponse();
    }),
    getSingleDocumentTranslatorModel: () => translatorModel,
    modelUsesTavilySearch,
    modelSupportsUploadedFile: (model, file) => !file.inlineData?.mimeType?.includes('pdf'),
    councilResponseCharLimit: 20,
    councilRetryDelayMs: 5,
    setTimeoutFn: (callback, delay) => {
      timers.push(delay);
      callback();
      return { delay };
    },
    clearTimeoutFn: () => {},
    getProxyAuthHeaders
  });

  return { fetchCalls, streamCalls, support, timers };
};

test('provider request support retries once after a transient stream failure', async () => {
  const firstError = new Error('first failed');
  const secondError = new Error('second failed');
  const attempts = [];
  const { support, timers } = createHarness({
    streamImpl: async (parts, onChunk, signal, isWebSearchForced, options) => {
      attempts.push({ parts, isWebSearchForced, options });
      if (attempts.length === 1) throw firstError;
      onChunk?.('ok');
      return 'second success';
    }
  });
  const retries = [];

  const result = await support.streamCouncilApiCallWithRetry(
    [{ text: 'hello' }],
    () => {},
    new AbortController().signal,
    true,
    { modelInfo: { id: 'm' }, onRetry: (error) => retries.push(error.message) }
  );

  assert.equal(result, 'second success');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].isWebSearchForced, true);
  assert.deepEqual(retries, ['first failed']);
  assert.deepEqual(timers, [5]);
});

test('provider request support preserves retry failure and abort boundaries', async () => {
  const { support: failingSupport } = createHarness({
    streamImpl: async () => {
      throw new Error('still failed');
    }
  });

  await assert.rejects(
    () => failingSupport.streamCouncilApiCallWithRetry([], () => {}, new AbortController().signal),
    /retried once; first attempt: still failed/
  );

  const abortError = new DOMException('Aborted', 'AbortError');
  const { support: abortSupport } = createHarness({
    streamImpl: async () => {
      throw abortError;
    }
  });

  await assert.rejects(
    () => abortSupport.streamCouncilApiCallWithRetry([], () => {}, new AbortController().signal),
    (error) => error === abortError
  );
});

test('Tavily search packet preserves payload, headers, depth, and formatted output', async () => {
  const { fetchCalls, support } = createHarness();

  const packet = await support.fetchTavilySearchPacket([{ text: '  latest   facts  ' }], new AbortController().signal, {
    label: 'Council search',
    maxResults: 3
  });

  assert.equal(packet, 'Council search: latest facts: Result');
  assert.equal(fetchCalls[0][0], '/api/tavily-search');
  assert.equal(fetchCalls[0][1].headers.Authorization, 'Bearer tavily-key');
  assert.equal(fetchCalls[0][1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(fetchCalls[0][1].body), {
    query: 'latest facts',
    search_depth: 'advanced',
    max_results: 3,
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    include_usage: true,
    topic: 'general'
  });
});

test('Tavily proxy requests attach Noureon session separately from the provider key', async () => {
  const { fetchCalls, support } = createHarness({
    getProxyAuthHeaders: async () => ({
      'X-Noureon-Authorization': 'Bearer cloud-session'
    })
  });

  await support.fetchTavilySearchPacket('facts', new AbortController().signal);

  assert.equal(fetchCalls[0][1].headers.Authorization, 'Bearer tavily-key');
  assert.equal(fetchCalls[0][1].headers['X-Noureon-Authorization'], 'Bearer cloud-session');
});

test('Tavily search packet preserves missing key, empty query, and HTTP error boundaries', async () => {
  const { support: missingKeySupport } = createHarness({ apiKeys: {} });
  await assert.rejects(
    () => missingKeySupport.fetchTavilySearchPacket('hello', new AbortController().signal),
    /Tavily API key is required/
  );

  const { support: emptyQuerySupport } = createHarness();
  await assert.rejects(
    () => emptyQuerySupport.fetchTavilySearchPacket('   ', new AbortController().signal),
    /No searchable text found/
  );

  const { support: httpSupport } = createHarness({
    fetchImpl: async () => createResponse({
      ok: false,
      status: 500,
      jsonValue: { error: { message: 'Tavily unavailable' } }
    })
  });
  await assert.rejects(
    () => httpSupport.fetchTavilySearchPacket('query', new AbortController().signal),
    /Tavily unavailable/
  );
});

test('single-model translation support builds document and Tavily packets before filtered request parts', async () => {
  const progress = [];
  const { fetchCalls, streamCalls, support } = createHarness({
    activeConversation: { isWebSearchEnabled: true },
    modelUsesTavilySearch: () => true
  });
  const parts = [
    { text: 'Question' },
    { inlineData: { mimeType: 'application/pdf', name: 'paper.pdf', data: 'pdf' } },
    { inlineData: { mimeType: 'image/png', name: 'image.png', data: 'img' } }
  ];

  const requestParts = await support.buildSingleModelTranslatedRequestParts(
    parts,
    { id: 'target', name: 'Target' },
    new AbortController().signal,
    (stage, message) => progress.push([stage, message])
  );

  assert.match(requestParts[0].text, /System-generated supporting context/);
  assert.match(requestParts[0].text, /Document translation packet/);
  assert.match(requestParts[0].text, /Web search packet/);
  assert.deepEqual(requestParts.slice(1), [
    { text: 'Question' },
    { inlineData: { mimeType: 'image/png', name: 'image.png', data: 'img' } }
  ]);
  assert.equal(streamCalls[0].options.modelInfo.id, 'translator');
  assert.match(streamCalls[0].parts[0].text, /Document Translation Packet/);
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(progress.map(([stage]) => stage), ['documentTranslation', 'documentTranslation', 'searchTranslation']);
});

test('single-model translation support preserves missing translator boundary', async () => {
  const { support } = createHarness({ translatorModel: null });

  await assert.rejects(
    () => support.buildSingleModelTranslatedRequestParts(
      [{ inlineData: { mimeType: 'application/pdf', name: 'paper.pdf', data: 'pdf' } }],
      { id: 'target', name: 'Target' },
      new AbortController().signal
    ),
    /document translator model/
  );
});

test('provider request support source avoids DOM, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/provider-request-support.js');

  for (const forbidden of [
    'document.',
    'window.',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'querySelector',
    'getElementById',
    'innerHTML',
    'classList',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
