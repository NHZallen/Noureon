import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createProviderRequestSupport } from '../src/app/legacy-runtime/features/provider-request-support.js';
import { normalizeTinyfishFetch, normalizeTinyfishSearch } from '../src/app/legacy-runtime/features/model-request-formatting.js';

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
  config = {},
  fetchImpl,
  modelUsesTavilySearch = () => false,
  streamImpl,
  translatorModel = { id: 'translator', name: 'Translator' }
} = {}) => {
  const fetchCalls = [];
  const searchData = [];
  const streamCalls = [];
  const timers = [];
  const support = createProviderRequestSupport({
    buildTavilySearchQuery: (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    formatTavilySearchPacket: (data, query, label, provider = 'Tavily') => {
      searchData.push(data);
      return `${label}: ${query}: ${data.results?.[0]?.title || 'none'}${provider === 'Tavily' ? '' : ` (${provider})`}`;
    },
    normalizeTinyfishSearch,
    normalizeTinyfishFetch,
    getErrorMessage: (body, fallback) => body?.error?.message || fallback,
    readErrorBody: async (response) => JSON.parse(await response.text()),
    getApiKeyForProvider: (provider) => apiKeys[provider] || '',
    getConfig: () => ({ tavilySearchDepth: 'advanced', uiLanguage: 'en', ...config }),
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
    clearTimeoutFn: () => {}
  });

  return { fetchCalls, searchData, streamCalls, support, timers };
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
    activeConversation: { isWebSearchEnabled: false },
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
    (stage, message) => progress.push([stage, message]),
    { webSearchEnabled: true }
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

test('with TinyFish chosen the search goes to its proxy with its key, and the packet names it', async () => {
  const { fetchCalls, support } = createHarness({
    apiKeys: { tinyfish: 'tinyfish-key' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: undefined
  });
  const sources = [];

  const packet = await support.fetchTavilySearchPacket('  latest   facts ', new AbortController().signal, {
    label: 'Single search',
    topic: 'news',
    onSources: (found) => sources.push(...found)
  });

  assert.equal(packet, 'Single search: latest facts: Result (TinyFish)');
  assert.equal(fetchCalls[0][0], '/api/tinyfish-search');
  assert.equal(fetchCalls[0][1].headers.Authorization, 'Bearer tinyfish-key');
  assert.deepEqual(JSON.parse(fetchCalls[0][1].body), { query: 'latest facts', domain_type: 'news' });
  assert.deepEqual(sources, [{ title: 'Result', url: 'https://example.test' }]);
});

test('each search source needs its own key: the other one does not do', async () => {
  const { support: tinyfishWithTavilyKey } = createHarness({ apiKeys: { tavily: 'tavily-key' }, config: { searchProvider: 'tinyfish' } });
  await assert.rejects(
    () => tinyfishWithTavilyKey.fetchTavilySearchPacket('hello', new AbortController().signal),
    /TinyFish API key is required/
  );
  const { support: tavilyWithTinyfishKey } = createHarness({ apiKeys: { tinyfish: 'tinyfish-key' } });
  await assert.rejects(
    () => tavilyWithTinyfishKey.fetchTavilySearchPacket('hello', new AbortController().signal),
    /Tavily API key is required/
  );
});

test('a TinyFish HTTP error is reported by name', async () => {
  const { support } = createHarness({
    apiKeys: { tinyfish: 'tinyfish-key' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: async () => createResponse({ ok: false, status: 429, textValue: JSON.stringify({}) })
  });
  await assert.rejects(
    () => support.fetchTavilySearchPacket('hello', new AbortController().signal),
    /TinyFish HTTP 429/
  );
});

const tinyfishRoutes = ({ search, fetchPages }) => async (url, init) => {
  if (url === '/api/tinyfish-search') return createResponse({ jsonValue: search });
  if (url === '/api/tinyfish-fetch') return fetchPages(init);
  throw new Error(`unexpected request ${url}`);
};

const searchResults = {
  results: [1, 2, 3, 4, 5].map((n) => ({ title: `Page ${n}`, url: `https://example.org/${n}`, snippet: `Snippet ${n}` }))
};

test('Fetch reads whole pages for the TinyFish key, up to ten, with the text cut and the unread ones listed', async () => {
  const calls = [];
  const { support } = createHarness({
    apiKeys: { tinyfish: 'tinyfish-key' },
    config: { searchProvider: 'tavily' },
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return createResponse({ jsonValue: { results: [{ url: 'https://a.test/1', final_url: 'https://a.test/one', title: 'One', text: 'x'.repeat(50), language: 'en' }] } });
    }
  });

  const { pages, failed } = await support.fetchPageContents(
    ['https://a.test/1', 'https://a.test/1', 'https://b.test/2', 'ftp://c.test/3', 'not an address', ...Array.from({ length: 12 }, (_, n) => `https://d.test/${n}`)],
    new AbortController().signal,
    { maxChars: 20 }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/tinyfish-fetch');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer tinyfish-key');
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.format, 'markdown');
  assert.equal(body.urls.length, 10, 'ten at most');
  assert.deepEqual(body.urls.slice(0, 2), ['https://a.test/1', 'https://b.test/2'], 'repeats and addresses that are not http(s) are left out');
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0], { url: 'https://a.test/1', finalUrl: 'https://a.test/one', title: 'One', language: 'en', text: 'x'.repeat(20), truncated: true });
  assert.ok(failed.includes('https://b.test/2'), 'what did not come back is named');
  assert.ok(!failed.includes('https://a.test/1'));

  assert.deepEqual(await support.fetchPageContents([], new AbortController().signal), { pages: [], failed: [] });
  const { support: noKey } = createHarness({ apiKeys: { tavily: 'tavily-key' } });
  await assert.rejects(() => noKey.fetchPageContents(['https://a.test/1'], new AbortController().signal), /TinyFish API key is required/);
});

test('in a normal chat with TinyFish as the source, the top three results are read in full and go in the packet', async () => {
  const fetched = [];
  const { support, searchData } = createHarness({
    apiKeys: { tinyfish: 'tinyfish-key' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: tinyfishRoutes({
      search: searchResults,
      fetchPages: async (init) => {
        fetched.push(JSON.parse(init.body).urls);
        return createResponse({ jsonValue: { results: [
          { url: 'https://example.org/1', title: 'Page 1', text: 'Full text one' },
          { url: 'https://example.org/3', final_url: 'https://example.org/three', title: 'Page 3', text: 'Full text three' }
        ] } });
      }
    })
  });

  await support.fetchTavilySearchPacket('hello', new AbortController().signal);

  assert.deepEqual(fetched, [['https://example.org/1', 'https://example.org/2', 'https://example.org/3']]);
  const [first, second, third, fourth] = searchData[0].results;
  assert.equal(first.page, 'Full text one');
  assert.equal(second.page, undefined, 'a page that could not be read keeps its snippet');
  assert.equal(third.page, 'Full text three');
  assert.equal(fourth.page, undefined, 'only the top results are read');
});

test('a failed or empty page read does not fail the search, but a stop does', async () => {
  const { support, searchData } = createHarness({
    apiKeys: { tinyfish: 'tinyfish-key' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: tinyfishRoutes({ search: searchResults, fetchPages: async () => { throw new Error('fetch is down'); } })
  });
  const packet = await support.fetchTavilySearchPacket('hello', new AbortController().signal);
  assert.match(packet, /Page 1/);
  assert.equal(searchData[0].results.some((result) => result.page), false);

  const controller = new AbortController();
  const { support: stopped } = createHarness({
    apiKeys: { tinyfish: 'tinyfish-key' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: tinyfishRoutes({
      search: searchResults,
      fetchPages: async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); }
    })
  });
  await assert.rejects(() => stopped.fetchTavilySearchPacket('hello', controller.signal), (error) => error.name === 'AbortError');
});

test('Tavily searches do not read whole pages', async () => {
  const { fetchCalls, support } = createHarness();
  await support.fetchTavilySearchPacket('hello', new AbortController().signal);
  assert.deepEqual(fetchCalls.map((call) => call[0]), ['/api/tavily-search']);
});
