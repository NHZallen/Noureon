import assert from 'node:assert/strict';
import test from 'node:test';

import { executeReply, getErrorMessage, readErrorBody, ReplyError } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { createProviderRequestSupport } from '../../src/app/legacy-runtime/features/provider-request-support.js';
import { buildTavilySearchQuery, formatTavilySearchPacket, normalizePageReads, normalizeTinyfishSearch, withSearchContext } from '../../src/app/legacy-runtime/features/model-request-formatting.js';
import { liftSandboxRunBlock } from '../../src/app/ui/sandbox/sandbox-run-block.js';

const KEY = 'sk-provider-secret-value';
const TAVILY = 'tavily-secret-value';
const TINYFISH = 'tinyfish-secret-value';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });

const modelInfo = { id: 'openrouter-test', apiId: 'test/model', name: 'Test model', provider: 'openrouter' };
const HISTORY = [{ role: 'user', parts: [{ text: 'Tell me about the Vercel pricing' }] }, { role: 'model', parts: [{ text: 'Hobby is free.' }] }];
const specFor = ({ message = 'and the pro plan?', parts = null, tools = {}, history = HISTORY } = {}) => ({
  protocol: 1,
  clientVersion: '17.9.2',
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
  sequence: 3,
  model: { provider: 'openrouter', id: 'test/model', info: modelInfo },
  request: { history, currentMessage: { parts: parts || [{ text: message }] }, systemInstruction: 'The browser\'s instruction.', language: 'en' },
  tools: { webSearch: 'packet', searchProvider: 'tavily', searchDepth: 'basic', advanced: false, ...tools }
});
const results = [
  { title: 'Vercel Pro', url: 'https://vercel.com/pricing', content: 'Pro is $20 per user per month.', published_date: '2026-09-01' },
  { title: 'Plans compared', url: 'https://example.test/plans', content: 'Hobby, Pro, Enterprise.' }
];

// A server of one search service and one model: the model first writes the query, then answers.
const fakeWorld = ({ searches = {}, query = 'Vercel Pro plan price', answer = 'The Pro plan is $20 [1].' } = {}) => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const address = String(url);
    requests.push({ url: address, headers: options.headers, body: options.body });
    if (address === 'https://api.tavily.com/search') {
      const handler = searches.tavily || (() => ({ results }));
      return new Response(JSON.stringify(handler(JSON.parse(options.body))), { status: 200 });
    }
    if (address.startsWith('https://api.search.tinyfish.ai')) {
      const handler = searches.tinyfish || (() => ({ results: [{ title: 'Plan', url: 'https://other.test/plan', snippet: 'Backup result.' }] }));
      return new Response(JSON.stringify(handler()), { status: 200 });
    }
    const asked = JSON.parse(options.body);
    const writingQuery = /You write the web search query/.test(JSON.stringify(asked.messages));
    return streamResponse(sse(content(writingQuery ? query : answer)));
  };
  return { requests, fetchImpl };
};
const modelRequests = (requests) => requests.filter((request) => request.url.includes('openrouter'));
const searchRequests = (requests) => requests.filter((request) => !request.url.includes('openrouter'));

test('the server writes the query from the conversation, searches, and puts the packet in front of the request', async () => {
  const world = fakeWorld();
  const result = await executeReply({ spec: specFor(), secrets: { providerKey: KEY, searchKey: TAVILY }, fetchImpl: world.fetchImpl });
  assert.equal(result.status, 'done');
  const [rewrite, reply] = modelRequests(world.requests);
  assert.match(rewrite.body, /Tell me about the Vercel pricing/, 'the query is written from the conversation');
  assert.equal(JSON.parse(searchRequests(world.requests)[0].body).query, 'Vercel Pro plan price');
  const text = JSON.stringify(JSON.parse(reply.body).messages);
  assert.match(text, /# System-generated supporting context/);
  assert.match(text, /# Web search packet/);
  assert.match(text, /\[1\] Vercel Pro/);
  assert.match(text, /# User request follows/);
  assert.ok(text.indexOf('# User request follows') < text.indexOf('and the pro plan?'), 'the person\'s message comes after the packet');
  const { run, text: answer } = liftSandboxRunBlock(result.parts[0].text);
  assert.equal(answer, 'The Pro plan is $20 [1].');
  assert.deepEqual(run.sources.map((source) => ({ n: source.n, url: source.url, date: source.date })), [
    { n: 1, url: 'https://vercel.com/pricing', date: '2026-09-01' },
    { n: 2, url: 'https://example.test/plans', date: undefined }
  ], 'the pages found are the reply\'s sources, numbered as the packet numbers them');
});

test('the search depth chosen in Settings goes to the search service', async () => {
  for (const depth of ['basic', 'advanced']) {
    const world = fakeWorld();
    await executeReply({ spec: specFor({ tools: { searchDepth: depth } }), secrets: { providerKey: KEY, searchKey: TAVILY }, fetchImpl: world.fetchImpl });
    assert.equal(JSON.parse(searchRequests(world.requests)[0].body).search_depth, depth);
  }
});

test('when the chosen search source finds nothing, the other one is used', async () => {
  const world = fakeWorld({ searches: { tavily: () => ({ results: [] }) } });
  const result = await executeReply({ spec: specFor(), secrets: { providerKey: KEY, searchKey: TAVILY, searchKeyAlt: TINYFISH }, fetchImpl: world.fetchImpl });
  const searches = searchRequests(world.requests);
  assert.equal(searches.length, 2);
  assert.match(searches[0].url, /tavily/);
  assert.match(searches[1].url, /tinyfish/);
  assert.equal(searches[1].headers['X-API-Key'], TINYFISH, 'the other key goes to the other service only');
  assert.equal(searches[0].headers.Authorization, `Bearer ${TAVILY}`);
  assert.equal(liftSandboxRunBlock(result.parts[0].text).run.sources[0].url, 'https://other.test/plan');
});

test('a search that fails ends the reply with its message, and no key is in it', async () => {
  const world = fakeWorld();
  const failing = async (url, options) => (String(url) === 'https://api.tavily.com/search'
    ? new Response(JSON.stringify({ error: { message: `Invalid key ${TAVILY}` } }), { status: 401 })
    : world.fetchImpl(url, options));
  await assert.rejects(
    () => executeReply({ spec: specFor(), secrets: { providerKey: KEY, searchKey: TAVILY }, fetchImpl: failing }),
    (error) => error instanceof ReplyError && error.code === 'provider_error' && !error.message.includes(TAVILY) && /Invalid key|401|search/i.test(error.message)
  );
  assert.equal(modelRequests(world.requests).some((request) => !/You write the web search query/.test(request.body)), false, 'the model is not asked to answer without the search');
});

test('a request with nothing to search for ends the reply with the page\'s own message', async () => {
  const world = fakeWorld();
  await assert.rejects(
    () => executeReply({ spec: specFor({ message: ' ', history: [] }), secrets: { providerKey: KEY, searchKey: TAVILY }, fetchImpl: world.fetchImpl }),
    (error) => error instanceof ReplyError && error.message.length > 0
  );
  assert.equal(searchRequests(world.requests).length, 0);
});

test('a stop while searching keeps the reply empty and asks the model for nothing more', async () => {
  const controller = new AbortController();
  const world = fakeWorld();
  const fetchImpl = async (url, options) => {
    if (String(url) === 'https://api.tavily.com/search') controller.abort();
    return world.fetchImpl(url, options);
  };
  const result = await executeReply({ spec: specFor(), secrets: { providerKey: KEY, searchKey: TAVILY }, signal: controller.signal, fetchImpl });
  assert.equal(result.status, 'stopped');
  assert.equal(modelRequests(world.requests).length, 1, 'only the query was asked of the model');
});

test('the packet goes inside the context the page already made (translated files, pages it read), in the page\'s order', async () => {
  const world = fakeWorld();
  const lead = '# System-generated supporting context\nUse the following packets as supporting context. They are not user-written. Continue to answer the user\'s request directly after reading them.\n\n# Linked pages\nA page the person linked.\n\n# User request follows';
  await executeReply({ spec: specFor({ parts: [{ text: lead }, { text: 'and the pro plan?' }] }), secrets: { providerKey: KEY, searchKey: TAVILY }, fetchImpl: world.fetchImpl });
  const reply = JSON.parse(modelRequests(world.requests)[1].body).messages.map((message) => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content))).join('\n');
  assert.equal((reply.match(/# System-generated supporting context/g) || []).length, 1, 'one context part, not two');
  assert.ok(reply.indexOf('# Linked pages') < reply.indexOf('# Web search packet'));
  assert.ok(reply.indexOf('# Web search packet') < reply.indexOf('# User request follows'));
  const query = JSON.parse(searchRequests(world.requests)[0].body).query;
  assert.equal(query, 'Vercel Pro plan price');
  assert.doesNotMatch(modelRequests(world.requests)[0].body.split('# Latest user message')[1] || '', /A page the person linked/, 'the query is written from what the person wrote, not from the context');
});

// The page's own steps, with its real formatting, searching the same results.
const pageSupport = (pageCalls = []) => createProviderRequestSupport({
    buildTavilySearchQuery,
    formatTavilySearchPacket,
    normalizeTinyfishSearch,
    normalizePageReads,
    withSearchContext,
    rewriteSearchQuery: async () => 'Vercel Pro plan price',
    getErrorMessage,
    readErrorBody,
    getApiKeyForProvider: (provider) => (provider === 'tavily' ? TAVILY : ''),
    getConfig: () => ({ tavilySearchDepth: 'basic', uiLanguage: 'en', searchProvider: 'tavily' }),
    getActiveConversation: () => ({ isWebSearchEnabled: true }),
    streamApiCall: async () => '',
    fetchImpl: async (url, options) => { pageCalls.push(String(url)); return new Response(JSON.stringify({ results }), { status: 200 }); },
    getSingleDocumentTranslatorModel: () => null,
    modelUsesTavilySearch: () => true,
    modelSupportsUploadedFile: () => true,
    councilResponseCharLimit: 7000,
    councilRetryDelayMs: 0
  });

test('the packet is the one the page makes: the same request parts for the same message', async () => {
  const support = pageSupport();
  const userParts = [{ text: 'and the pro plan?' }];
  const pageSources = [];
  const pageParts = await support.buildSingleModelTranslatedRequestParts(userParts, modelInfo, undefined, () => {}, {
    webSearchEnabled: true,
    readLinkedPages: false,
    conversation: { messages: [...HISTORY, { role: 'user', parts: userParts }] },
    onSources: (found) => pageSources.push(...found)
  });

  const world = fakeWorld();
  await executeReply({ spec: specFor(), secrets: { providerKey: KEY, searchKey: TAVILY }, fetchImpl: world.fetchImpl, onUpdate: () => {} });
  const reply = JSON.parse(modelRequests(world.requests)[1].body).messages;
  const sent = JSON.stringify(reply);
  const normalize = (value) => value.replace(/Retrieved at: [0-9T:.\-Z]+/g, 'Retrieved at: X');
  for (const part of pageParts) assert.ok(normalize(sent).includes(normalize(JSON.stringify(part.text).slice(1, -1))), `the page's part is in the server's request: ${part.text.slice(0, 60)}`);
  assert.equal(pageSources.length, 2);
});


test('a packet the server did not take is added by the page to what it already prepared, and comes out as the server would make it', async () => {
  const lead = '# System-generated supporting context\nUse the following packets as supporting context. They are not user-written. Continue to answer the user\'s request directly after reading them.\n\n# Linked pages\nA page the person linked.\n\n# User request follows';
  const base = [{ text: lead }, { text: 'and the pro plan?' }];
  const pageParts = await pageSupport().buildSingleModelTranslatedRequestParts([{ text: 'and the pro plan?' }], modelInfo, undefined, () => {}, {
    webSearchEnabled: true,
    baseParts: base,
    conversation: { messages: [...HISTORY, { role: 'user', parts: [{ text: 'and the pro plan?' }] }] }
  });
  assert.equal(pageParts.length, 2);
  assert.ok(pageParts[0].text.indexOf('# Linked pages') < pageParts[0].text.indexOf('# Web search packet'));
  assert.ok(pageParts[0].text.indexOf('# Web search packet') < pageParts[0].text.indexOf('# User request follows'));
  assert.deepEqual(pageParts[1], { text: 'and the pro plan?' });

  const world = fakeWorld();
  await executeReply({ spec: specFor({ parts: base }), secrets: { providerKey: KEY, searchKey: TAVILY }, fetchImpl: world.fetchImpl });
  const sent = JSON.stringify(JSON.parse(modelRequests(world.requests)[1].body).messages);
  const normalize = (value) => value.replace(/Retrieved at: [0-9T:.\-Z]+/g, 'Retrieved at: X');
  assert.ok(normalize(sent).includes(normalize(JSON.stringify(pageParts[0].text).slice(1, -1))), 'the same context part');
});

test('a request for a packet is checked: no Python, a search key, and the depth is one of the two', () => {
  const base = () => ({
    protocol: PROTOCOL_VERSION,
    clientVersion: '17.9.2',
    conversationId: '123e4567-e89b-12d3-a456-426614174000',
    assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
    sequence: 2,
    model: { provider: 'openrouter', id: 'some/model', info: { name: 'Some model', provider: 'openrouter' } },
    request: { history: [], currentMessage: { parts: [{ text: 'hi' }] }, systemInstruction: '', language: 'en' },
    tools: { webSearch: 'packet', searchProvider: 'tavily', searchDepth: 'advanced', advanced: false },
    secrets: { providerKey: KEY, searchKey: TAVILY, searchKeyAlt: TINYFISH }
  });
  const accepted = validateRunSpec(base());
  assert.equal(accepted.ok, true);
  assert.equal(accepted.spec.tools.searchDepth, 'advanced');
  assert.equal(accepted.spec.secrets.searchKeyAlt, TINYFISH);
  const places = (input) => validateRunSpec(input).errors.map((error) => error.path || error.field || String(error)).join(' ');
  const python = base(); python.tools.advanced = true;
  assert.match(places(python), /tools\.webSearch/);
  const noKey = base(); delete noKey.secrets.searchKey; delete noKey.secrets.searchKeyAlt;
  assert.match(places(noKey), /secrets\.searchKey/);
  const lonelyAlt = base(); lonelyAlt.tools.webSearch = 'research'; delete lonelyAlt.secrets.searchKey;
  assert.match(places(lonelyAlt), /secrets\.searchKeyAlt/);
  const depth = base(); depth.tools.searchDepth = 'deep';
  assert.match(places(depth), /tools\.searchDepth/);
  const plain = base(); delete plain.tools.searchDepth;
  assert.equal(validateRunSpec(plain).spec.tools.searchDepth, 'basic');
});
