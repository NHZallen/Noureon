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
  streamImpl,
  translatorModel = { id: 'translator', name: 'Translator' },
  documentContextService = null
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
    documentContextService,
    councilResponseCharLimit: 20,
    councilRetryDelayMs: 5,
    setTimeoutFn: (callback, delay) => {
      timers.push(delay);
      callback();
      return { delay };
    },
    clearTimeoutFn: () => {}
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

test('Tavily search packet preserves missing key, empty query, and HTTP error boundaries', async () => {
  const { support: missingKeySupport } = createHarness({ apiKeys: {} });
  await assert.rejects(
    () => missingKeySupport.fetchTavilySearchPacket('hello', new AbortController().signal),
    /Tavily API key is required/
  );

  const { support: emptyQuerySupport } = createHarness();
  await assert.rejects(
    () => emptyQuerySupport.fetchTavilySearchPacket('   ', new AbortController().signal),
    /No searchable text (?:was )?found/
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

test('native document context bypasses the translator and is not cut by the legacy 7000-character limit', async () => {
  const longContext = `${'A'.repeat(7600)}END-OF-DOCUMENT`;
  const calls = [];
  const documentContextService = {
    supportsAttachment: () => true,
    buildContext: async options => {
      calls.push(options);
      return options.retrieveContext
        ? { text: longContext, systemInstruction: 'Untrusted document.', lowConfidence: false, coverageBatchTexts: [] }
        : { text: '', indexResults: [], indexFailures: [] };
    }
  };
  const { streamCalls, support } = createHarness({ translatorModel: null, documentContextService });
  const requestParts = await support.buildSingleModelTranslatedRequestParts([
    { text: 'Read the file' },
    { inlineData: { mimeType: 'application/pdf', name: 'paper.pdf', data: 'AQID' } }
  ], { id: 'target', name: 'Target' }, new AbortController().signal);
  assert.equal(streamCalls.length, 0);
  assert.equal(calls.length, 2);
  assert.match(requestParts[0].text, /END-OF-DOCUMENT/);
  assert.doesNotMatch(requestParts[0].text, /\[truncated\]/);
});

test('full-document requests process every hierarchical coverage batch before the answering pass', async () => {
  const documentContextService = {
    supportsAttachment: () => true,
    buildContext: async options => options.retrieveContext
      ? { text: '', systemInstruction: 'Untrusted document.', lowConfidence: false, coverageBatchTexts: ['BATCH-ONE', 'BATCH-TWO'] }
      : { text: '', indexResults: [], indexFailures: [] }
  };
  const { streamCalls, support } = createHarness({ translatorModel: null, documentContextService });
  const requestParts = await support.buildSingleModelTranslatedRequestParts([
    { text: 'Summarize the entire document' },
    { inlineData: { mimeType: 'application/pdf', name: 'large.pdf', data: 'AQID' } }
  ], { id: 'target', name: 'Target' }, new AbortController().signal);
  assert.equal(streamCalls.length, 2);
  assert.match(streamCalls[0].parts[0].text, /BATCH-ONE/);
  assert.match(streamCalls[1].parts[0].text, /BATCH-TWO/);
  assert.match(requestParts[0].text, /Hierarchical full-document evidence/);
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
