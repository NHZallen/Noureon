import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createProviderRequestSupport } from '../src/app/legacy-runtime/features/provider-request-support.js';
import { normalizePageReads, normalizeTinyfishSearch, withSearchContext } from '../src/app/legacy-runtime/features/model-request-formatting.js';

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
  rewriteSearchQuery,
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
    normalizePageReads,
    withSearchContext,
    ...(rewriteSearchQuery ? { rewriteSearchQuery } : {}),
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
  assert.deepEqual(sources, [{ title: 'Result', url: 'https://example.test', n: 1 }], 'numbered as the packet numbers it, so [n] finds its page');
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

const LINK = 'https://example.org/article';
const readerBody = (init) => JSON.parse(init.body);
const pageResponse = (results) => createResponse({ jsonValue: { results } });

test('reading pages uses the search source\'s reader first, and either key is enough', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return pageResponse([{ url: LINK, title: 'Article', text: 'Whole article' }, { url: LINK, raw_content: 'Whole article' }].slice(url.includes('tavily') ? 1 : 0, url.includes('tavily') ? 2 : 1));
  };

  const { support: tinyfishFirst } = createHarness({ apiKeys: { tinyfish: 'tf', tavily: 'tv' }, config: { searchProvider: 'tinyfish' }, fetchImpl });
  const first = await tinyfishFirst.fetchPageContents([LINK], new AbortController().signal);
  assert.equal(first.reader, 'tinyfish');
  assert.deepEqual(calls.map((call) => call[0]), ['/api/tinyfish-fetch']);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer tf');
  assert.deepEqual(readerBody(calls[0][1]), { urls: [LINK], format: 'markdown' });

  calls.length = 0;
  const { support: tavilyFirst } = createHarness({ apiKeys: { tinyfish: 'tf', tavily: 'tv' }, fetchImpl });
  const second = await tavilyFirst.fetchPageContents([LINK], new AbortController().signal);
  assert.equal(second.reader, 'tavily');
  assert.deepEqual(calls.map((call) => call[0]), ['/api/tavily-extract']);
  assert.equal(calls[0][1].headers.Authorization, 'Bearer tv');
  assert.deepEqual(readerBody(calls[0][1]), { urls: [LINK], extract_depth: 'advanced', format: 'markdown', include_images: false });
  assert.equal(second.pages[0].text, 'Whole article');

  // Only the other source's key: it is used.
  calls.length = 0;
  const { support: onlyTinyfishKey } = createHarness({ apiKeys: { tinyfish: 'tf' }, fetchImpl });
  assert.equal((await onlyTinyfishKey.fetchPageContents([LINK], new AbortController().signal)).reader, 'tinyfish');
  assert.deepEqual(calls.map((call) => call[0]), ['/api/tinyfish-fetch']);
});

test('what the first reader leaves unread, or fails on, goes to the other reader', async () => {
  const calls = [];
  const { support } = createHarness({
    apiKeys: { tinyfish: 'tf', tavily: 'tv' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: async (url, init) => {
      calls.push([url, readerBody(init).urls]);
      if (url === '/api/tinyfish-fetch') return pageResponse([{ url: 'https://a.test/1', text: 'One' }]);
      return pageResponse([{ url: 'https://a.test/2', raw_content: 'Two' }]);
    }
  });
  const result = await support.fetchPageContents(['https://a.test/1', 'https://a.test/2', 'https://a.test/3'], new AbortController().signal);
  assert.deepEqual(calls, [['/api/tinyfish-fetch', ['https://a.test/1', 'https://a.test/2', 'https://a.test/3']], ['/api/tavily-extract', ['https://a.test/2', 'https://a.test/3']]]);
  assert.deepEqual(result.pages.map((page) => page.text), ['One', 'Two']);
  assert.deepEqual(result.failed, [{ url: 'https://a.test/3', reason: 'failed' }]);

  const { support: broken } = createHarness({
    apiKeys: { tinyfish: 'tf', tavily: 'tv' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: async (url) => (url === '/api/tinyfish-fetch'
      ? createResponse({ ok: false, status: 500, textValue: JSON.stringify({}) })
      : pageResponse([{ url: LINK, raw_content: 'From the other' }]))
  });
  const recovered = await broken.fetchPageContents([LINK], new AbortController().signal);
  assert.equal(recovered.pages[0].text, 'From the other');
  assert.equal(recovered.reader, 'tavily');
});

test('with no key at all, or pages that cannot be read, the result says so instead of throwing', async () => {
  const { support: noKey } = createHarness({ apiKeys: {} });
  assert.deepEqual(await noKey.fetchPageContents([LINK], new AbortController().signal), { pages: [], failed: [{ url: LINK, reason: 'noReader' }], reader: null });
  assert.deepEqual(await noKey.fetchPageContents([], new AbortController().signal), { pages: [], failed: [], reader: null });

  const { support: unreadable } = createHarness({ apiKeys: { tavily: 'tv' }, fetchImpl: async () => pageResponse([]) });
  assert.deepEqual(await unreadable.fetchPageContents([LINK], new AbortController().signal), { pages: [], failed: [{ url: LINK, reason: 'failed' }], reader: null });

  const controller = new AbortController();
  const { support: stopped } = createHarness({
    apiKeys: { tavily: 'tv' },
    fetchImpl: async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); }
  });
  await assert.rejects(() => stopped.fetchPageContents([LINK], controller.signal), (error) => error.name === 'AbortError');
});

test('pages are read ten at a time at most, each address once, and only http(s) ones', async () => {
  const seen = [];
  const { support } = createHarness({
    apiKeys: { tinyfish: 'tf' },
    config: { searchProvider: 'tinyfish' },
    fetchImpl: async (url, init) => { seen.push(readerBody(init).urls); return pageResponse([]); }
  });
  await support.fetchPageContents(['https://a.test/1', 'https://a.test/1', 'ftp://x.test', 'nope', ...Array.from({ length: 14 }, (_, n) => `https://b.test/${n}`)], new AbortController().signal);
  assert.equal(seen[0].length, 10);
  assert.deepEqual(seen[0].slice(0, 2), ['https://a.test/1', 'https://b.test/0']);
});

test('a linked address is read in a normal chat for OpenRouter and NVIDIA models, with or without search, and the pages are sources', async () => {
  const calls = [];
  const sources = [];
  const progress = [];
  const { support } = createHarness({
    apiKeys: { tinyfish: 'tf' },
    config: { searchProvider: 'tinyfish' },
    modelUsesTavilySearch: (model) => model.provider !== 'gemini',
    fetchImpl: async (url) => { calls.push(url); return pageResponse([{ url: LINK, final_url: `${LINK}?x=1`, title: 'Article', text: 'Whole article text' }]); }
  });
  const parts = [{ text: `Please summarise ${LINK}.` }];

  const result = await support.buildSingleModelTranslatedRequestParts(parts, { id: 'm', name: 'Model', provider: 'openrouter' }, new AbortController().signal, (stage) => progress.push(stage), {
    webSearchEnabled: false,
    onSources: (found) => sources.push(...found)
  });

  assert.deepEqual(calls, ['/api/tinyfish-fetch'], 'no search: only the page is read');
  assert.deepEqual(progress, ['linkedPages']);
  assert.deepEqual(sources, [{ title: 'Article', url: `${LINK}?x=1`, read: true }]);
  assert.match(result[0].text, /Web pages the user linked/);
  assert.match(result[0].text, /Whole article text/);
  assert.match(result[0].text, /The user did not write this text/);
  assert.equal(result.at(-1).text, parts[0].text, 'the user\'s message follows');

  // Gemini opens links itself, and an image model has nothing to read them for.
  calls.length = 0;
  for (const model of [{ id: 'g', name: 'Gemini', provider: 'gemini' }, { id: 'i', name: 'Image', provider: 'openrouter', outputModality: 'image' }]) {
    const untouched = await support.buildSingleModelTranslatedRequestParts(parts, model, new AbortController().signal, () => {}, {});
    assert.deepEqual(untouched, parts);
  }
  assert.deepEqual(calls, []);
});

test('with a search and a linked address both, the search packet and the pages both go in', async () => {
  const sources = [];
  const { support } = createHarness({
    apiKeys: { tinyfish: 'tf' },
    config: { searchProvider: 'tinyfish' },
    modelUsesTavilySearch: () => true,
    fetchImpl: async (url) => (url === '/api/tinyfish-search'
      ? createResponse()
      : pageResponse([{ url: LINK, title: 'Article', text: 'Whole article text' }]))
  });
  const result = await support.buildSingleModelTranslatedRequestParts([{ text: `latest news about ${LINK}` }], { id: 'm', name: 'Model', provider: 'openrouter' }, new AbortController().signal, () => {}, {
    webSearchEnabled: true,
    onSources: (found) => sources.push(...found)
  });
  assert.match(result[0].text, /Web pages the user linked/);
  assert.match(result[0].text, /Web search packet/);
  assert.deepEqual(sources.map((source) => Boolean(source.read)), [true, false], 'the pages read, then the pages searched');
});

test('a linked address that cannot be read is told to the model, with the reason', async () => {
  const noReader = createHarness({ apiKeys: {}, modelUsesTavilySearch: () => true });
  const unreadable = await noReader.support.buildSingleModelTranslatedRequestParts([{ text: `see ${LINK}` }], { id: 'm', name: 'M', provider: 'openrouter' }, new AbortController().signal, () => {}, {});
  assert.match(unreadable[0].text, /Linked pages that could not be read/);
  assert.match(unreadable[0].text, new RegExp(LINK.replace(/\./g, '\\.')));
  assert.match(unreadable[0].text, /No page reader is set up/);
  assert.match(unreadable[0].text, /Tell the user plainly/);

  const blocked = createHarness({ apiKeys: { tavily: 'tv' }, modelUsesTavilySearch: () => true, fetchImpl: async () => pageResponse([]) });
  const failed = await blocked.support.buildSingleModelTranslatedRequestParts([{ text: `see ${LINK}` }], { id: 'm', name: 'M', provider: 'openrouter' }, new AbortController().signal, () => {}, {});
  assert.match(failed[0].text, /could not be fetched/);
});

test('Tavily searches do not read whole pages, and a message with no address reads nothing', async () => {
  const { fetchCalls, support } = createHarness({ modelUsesTavilySearch: () => true });
  await support.fetchTavilySearchPacket('hello', new AbortController().signal);
  assert.deepEqual(fetchCalls.map((call) => call[0]), ['/api/tavily-search']);
  const none = await support.buildSingleModelTranslatedRequestParts([{ text: 'no address here' }], { id: 'm', name: 'M', provider: 'openrouter' }, new AbortController().signal, () => {}, {});
  assert.equal(none.length, 1);
  assert.equal(fetchCalls.length, 1);
});

test('a message that only says to search is searched with what the conversation was about, by either source', async () => {
  const conversation = { messages: [
    { role: 'user', parts: [{ text: 'Does DeepSeek V4.1 Flash have a reasoning effort parameter?' }] },
    { role: 'model', parts: [{ text: 'I am not sure.' }] },
    { role: 'user', parts: [{ text: '你去查阿' }] }
  ] };
  for (const [apiKeys, config, route] of [
    [{ tavily: 'tv' }, {}, '/api/tavily-search'],
    [{ tinyfish: 'tf' }, { searchProvider: 'tinyfish' }, '/api/tinyfish-search']
  ]) {
    const { fetchCalls, support } = createHarness({ apiKeys, config, modelUsesTavilySearch: () => true });
    await support.buildSingleModelTranslatedRequestParts([{ text: '你去查阿' }], { id: 'm', name: 'M', provider: 'openrouter' }, new AbortController().signal, () => {}, {
      webSearchEnabled: true,
      conversation
    });
    const search = fetchCalls.find((call) => call[0] === route);
    assert.equal(JSON.parse(search[1].body).query, 'Does DeepSeek V4.1 Flash have a reasoning effort parameter? 你去查阿', route);
  }
});

test('the search query is the one a small model wrote from the conversation, for either source, and the chat model is passed along', async () => {
  const asked = [];
  const conversation = { messages: [{ role: 'user', parts: [{ text: 'DeepSeek V4.1 Flash thinking?' }] }, { role: 'user', parts: [{ text: '你去查阿' }] }] };
  const model = { id: 'm', name: 'M', provider: 'openrouter' };
  for (const [apiKeys, config, route] of [
    [{ tavily: 'tv' }, {}, '/api/tavily-search'],
    [{ tinyfish: 'tf' }, { searchProvider: 'tinyfish' }, '/api/tinyfish-search']
  ]) {
    const { fetchCalls, support } = createHarness({
      apiKeys,
      config,
      modelUsesTavilySearch: () => true,
      rewriteSearchQuery: async (request) => { asked.push(request); return 'DeepSeek V4.1 Flash reasoning effort'; }
    });
    await support.buildSingleModelTranslatedRequestParts([{ text: '你去查阿' }], model, new AbortController().signal, () => {}, { webSearchEnabled: true, conversation });
    assert.equal(JSON.parse(fetchCalls.find((call) => call[0] === route)[1].body).query, 'DeepSeek V4.1 Flash reasoning effort', route);
  }
  assert.equal(asked.length, 2);
  assert.equal(asked[0].text, '你去查阿');
  assert.equal(asked[0].messages, conversation.messages);
  assert.equal(asked[0].modelInfo, model);
});

test('what the small model wrote goes through the same query builder as any other text (which adds the date only to a question about what is current)', async () => {
  const run = async (written) => {
    const { fetchCalls, support } = createHarness({ rewriteSearchQuery: async () => written });
    await support.fetchTavilySearchPacket([{ text: 'x' }], new AbortController().signal, { conversation: { messages: [{ role: 'user', parts: [{ text: 'earlier' }] }] } });
    return JSON.parse(fetchCalls[0][1].body).query;
  };
  assert.equal(await run('reverse a list in python'), 'reverse a list in python');
});

test('when no small model answers, the earlier messages are put in front instead, and the search still goes', async () => {
  const conversation = { messages: [
    { role: 'user', parts: [{ text: 'Does DeepSeek V4.1 Flash have a reasoning effort parameter?' }] },
    { role: 'user', parts: [{ text: '你去查阿' }] }
  ] };
  const { fetchCalls, support } = createHarness({ rewriteSearchQuery: async () => null });
  await support.fetchTavilySearchPacket([{ text: '你去查阿' }], new AbortController().signal, { conversation });
  assert.equal(JSON.parse(fetchCalls[0][1].body).query, 'Does DeepSeek V4.1 Flash have a reasoning effort parameter? 你去查阿');

  const failing = createHarness({ rewriteSearchQuery: async () => { throw new Error('unexpected'); } });
  await assert.rejects(() => failing.support.fetchTavilySearchPacket([{ text: '你去查阿' }], new AbortController().signal, { conversation }), /unexpected/, 'the rewriter itself never throws; a stop is the only error it passes on');
});

test('a query that is already written (the council\'s) is searched as it is, and buildSearchQuery is the same thing for the council', async () => {
  const { fetchCalls, support } = createHarness({ rewriteSearchQuery: async () => { throw new Error('not asked'); } });
  await support.fetchTavilySearchPacket('already a query', new AbortController().signal);
  assert.equal(JSON.parse(fetchCalls[0][1].body).query, 'already a query');

  const { support: withRewriter } = createHarness({ rewriteSearchQuery: async ({ modelInfo }) => `written for ${modelInfo.id}` });
  assert.equal(await withRewriter.buildSearchQuery([{ text: '你去查阿' }], { conversation: { messages: [] }, modelInfo: { id: 'synth' } }), 'written for synth');
});

