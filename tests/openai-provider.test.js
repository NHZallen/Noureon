import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamApiCall } from '../src/app/runtime/reply/stream-api-call.js';
import { buildOpenAiRequest, getOpenAiSafetyIdentifier, openAiSafetyIdentifier, setOpenAiUserId } from '../src/app/runtime/reply/openai-request.js';
import { applyResponsesTools, createResponsesCollector } from '../src/app/runtime/features/tool-call-formats.js';
import { MODELS, createModelRegistry, getModelApiId, getModelReasoningConfig, getProviderLabel, modelGeneratesImages, modelSupportsDocumentUpload, modelSupportsToolCalling, modelSupportsUploadedFile, modelSupportsVision, modelSupportsWebSearch, modelUsesNativeWebSearch, modelUsesTavilySearch, normalizeReasoningEffort } from '../src/app/runtime/shell/model-registry.js';
import { OPENAI_MODELS, OPENAI_MODEL_IDS, OPENAI_TEXT_MODEL_IDS } from '../src/app/runtime/shell/openai-models.js';
import { planServerReply } from '../src/app/runtime/server-reply/server-reply.js';

const model = (apiId) => MODELS.find((entry) => entry.id === `openai-api/${apiId}`);
const byteStream = (chunks) => {
  const encoder = new TextEncoder();
  return new ReadableStream({ start(controller) { chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk))); controller.close(); } });
};
const SSE = (events) => events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
const reply = ({ ok = true, status = 200, chunks = [], body } = {}) => ({ ok, status, statusText: '', body: byteStream(chunks), text: async () => body ?? '', json: async () => JSON.parse(body ?? '{}') });

test('the models of OpenAI: four for text and two for pictures, known by an id of their own and by the id the service uses', () => {
  assert.equal(OPENAI_MODELS.length, 6);
  assert.deepEqual(OPENAI_TEXT_MODEL_IDS.map((id) => id.replace('openai-api/', '')).sort(), ['gpt-6-astra', 'gpt-6-luna', 'gpt-6.1-sol', 'gpt-6.1-terra']);
  for (const entry of OPENAI_MODELS) {
    assert.ok(MODELS.some((listed) => listed.id === entry.id), `${entry.id} is in the list of the app`);
    assert.equal(entry.provider, 'openai');
    assert.equal(entry.id, `openai-api/${getModelApiId(entry)}`);
    assert.ok(!MODELS.some((other) => other !== entry && other.id === getModelApiId(entry)), 'no model of another provider has the id the service uses');
    assert.equal(getProviderLabel(entry.provider), 'OpenAI');
  }
  // The same models at OpenRouter keep their own ids.
  assert.ok(MODELS.some((entry) => entry.id === 'openai/gpt-6-astra' && entry.provider === 'openrouter'));
  for (const id of OPENAI_TEXT_MODEL_IDS) {
    const entry = MODELS.find((candidate) => candidate.id === id);
    assert.ok(modelSupportsToolCalling(entry) && modelSupportsVision(entry) && modelSupportsDocumentUpload(entry) && modelSupportsWebSearch(entry), id);
  }
  for (const id of OPENAI_MODEL_IDS.filter((candidate) => !OPENAI_TEXT_MODEL_IDS.includes(candidate))) assert.equal(modelGeneratesImages(MODELS.find((candidate) => candidate.id === id)), true, id);
});

test('the depths of thinking: the ones the probe found for Luna, and the usual for the others', () => {
  assert.deepEqual(getModelReasoningConfig(model('gpt-6-luna')).options, ['none', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(getModelReasoningConfig(model('gpt-6-astra')).options, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(getModelReasoningConfig(model('gpt-6-astra')).providerParameter, 'openaiReasoningEffort');
  assert.equal(normalizeReasoningEffort(model('gpt-6-astra'), 'none'), 'medium', 'a depth the model lacks goes to its own');
});

test('files: a picture and a PDF go to the model as they are, any other document and a video are read here', () => {
  const luna = model('gpt-6-luna');
  assert.equal(modelSupportsUploadedFile(luna, { type: 'image/png' }), true);
  assert.equal(modelSupportsUploadedFile(luna, { type: 'application/pdf' }), true);
  assert.equal(modelSupportsUploadedFile(luna, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), false);
  assert.equal(modelSupportsUploadedFile(luna, { type: 'video/mp4' }), false);
});

test('web search: OpenAI\'s own tool unless the person chose the search service, in the registry and for the server', () => {
  const luna = model('gpt-6-luna');
  assert.equal(modelUsesNativeWebSearch(luna), true);
  assert.equal(modelUsesTavilySearch(luna), false);
  assert.equal(modelUsesNativeWebSearch(luna, { openaiWebSearch: 'provider' }), false);
  assert.equal(modelUsesTavilySearch(luna, { openaiWebSearch: 'provider' }), true);
  // The picture models search nothing.
  assert.equal(modelUsesNativeWebSearch(model('gpt-image-2.5-flare')), false);
  // The page's registry reads the choice from the settings each time.
  let config = { openaiWebSearch: 'official' };
  const registry = createModelRegistry({ getConfig: () => config, normalizeConversationModel: () => luna });
  assert.equal(registry.modelUsesNativeWebSearch(luna), true);
  config = { openaiWebSearch: 'provider' };
  assert.equal(registry.modelUsesTavilySearch(luna), true);
  assert.equal(registry.conversationNeedsTavilySearch({ isWebSearchEnabled: true }), true);
  // The server makes a reply with OpenAI's own search as a "grounding" reply, and with the search service as research or a packet.
  assert.equal(planServerReply({ config: { openaiWebSearch: 'official' }, advanced: false, webSearchEnabled: true, researchByModel: false, provider: 'openai' }).webSearch, 'grounding');
  assert.equal(planServerReply({ config: { openaiWebSearch: 'provider' }, advanced: false, webSearchEnabled: true, researchByModel: false, provider: 'openai' }).webSearch, 'packet');
  assert.equal(planServerReply({ config: { openaiWebSearch: 'official' }, advanced: true, webSearchEnabled: true, researchByModel: false, provider: 'openai' }).ok, false, 'Python with OpenAI\'s search is made here');
});

test('the identifier of the account is a hash that stays the same, and nothing when the setting is off or nobody is known', async () => {
  const first = await openAiSafetyIdentifier('user-1');
  assert.match(first, /^[0-9a-f]{32}$/);
  assert.equal(first, await openAiSafetyIdentifier('user-1'));
  assert.notEqual(first, await openAiSafetyIdentifier('user-2'));
  assert.equal(first.includes('user'), false);
  assert.equal(await openAiSafetyIdentifier(''), '');
  setOpenAiUserId('user-1');
  assert.equal(await getOpenAiSafetyIdentifier({}), first);
  assert.equal(await getOpenAiSafetyIdentifier({ openaiSafetyIdentifier: false }), '');
  setOpenAiUserId('');
  assert.equal(await getOpenAiSafetyIdentifier({}), '');
});

test('the request: the Responses API, nothing kept, the depth of thinking, the identifier, no temperature, the search tool beside the functions', () => {
  const info = model('gpt-6-luna');
  const request = buildOpenAiRequest({
    modelId: 'gpt-6-luna',
    apiKey: 'sk-test',
    historyForApi: [{ role: 'user', parts: [{ text: 'Hi' }] }, { role: 'model', parts: [{ text: 'Hello' }] }],
    currentMessageForApi: { role: 'user', parts: [{ text: 'Search it' }] },
    generationConfig: { temperature: 0.7, topP: 0.9, maxTokens: 2000 },
    reasoningEffort: 'high',
    reasoningConfig: getModelReasoningConfig(info),
    systemInstruction: { parts: [{ text: 'Be brief.' }] },
    buildResponsesInput: (messages) => messages.map((message) => ({ role: message.role === 'model' ? 'assistant' : message.role, content: [{ type: 'input_text', text: message.parts[0].text }] })),
    safetyIdentifier: 'abc',
    webSearch: true
  });
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.headers.Authorization, 'Bearer sk-test');
  const { payload } = request;
  assert.equal(payload.store, false);
  assert.equal(payload.stream, true);
  assert.deepEqual(payload.reasoning, { effort: 'high' });
  assert.equal(payload.safety_identifier, 'abc');
  assert.equal(payload.max_output_tokens, 2000);
  assert.equal(payload.instructions, 'Be brief.');
  assert.equal('temperature' in payload || 'top_p' in payload, false);
  assert.deepEqual(payload.tools, [{ type: 'web_search' }]);
  applyResponsesTools(payload, { tools: [{ name: 'run_python', description: 'x', parameters: { type: 'object' } }] });
  assert.deepEqual(payload.tools.map((tool) => tool.type), ['web_search', 'function']);
  const none = buildOpenAiRequest({ modelId: 'x', apiKey: 'k', historyForApi: [], currentMessageForApi: { role: 'user', parts: [{ text: 'a' }] }, generationConfig: { maxTokens: null }, reasoningEffort: null, reasoningConfig: null, buildResponsesInput: () => [] });
  assert.equal('safety_identifier' in none.payload || 'tools' in none.payload || 'reasoning' in none.payload || 'max_output_tokens' in none.payload, false);
});

test('the search items of OpenAI are not sent back with the results of the tools; the pages it cited are the sources', () => {
  const payload = { input: [] };
  applyResponsesTools(payload, { tools: [], toolTurns: [{ assistant: { responseItems: [{ type: 'web_search_call', id: 'ws_1' }, { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{}' }] }, results: [{ id: 'c1', content: 'ok' }] }] });
  assert.deepEqual(payload.input.map((item) => item.type), ['function_call', 'function_call_output']);
  const collector = createResponsesCollector();
  collector.add({ type: 'response.output_text.annotation.added', annotation: { type: 'url_citation', url: 'https://a.example', title: 'A' } });
  collector.add({ type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'x', annotations: [{ type: 'url_citation', url: 'https://a.example', title: 'A' }, { type: 'url_citation', url: 'https://b.example', title: 'B' }] }] }] } });
  assert.deepEqual(collector.result().sources, [{ title: 'A', url: 'https://a.example' }, { title: 'B', url: 'https://b.example' }]);
});

const harness = ({ apiId, fetchImpl, config = {}, conversation = {} }) => {
  const info = model(apiId);
  const requests = [];
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => ({ id: 'conv-1', model: info.id, messages: [{ role: 'user', parts: [{ text: 'Hello' }] }], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: null }, ...conversation }),
    normalizeConversationModel: () => info,
    getModelApiId,
    getApiKeyForProvider: () => 'sk-secret',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'en', uiLanguage: 'en', isLearningMode: false, memoryEnabled1: false, ...config }),
    getAstras: () => [],
    getPersonalMemories: () => [],
    modelSupportsUploadedFile,
    modelSupportsVision,
    getModelReasoningConfig,
    normalizeReasoningEffort,
    getSafetyIdentifier: async () => 'ident-1',
    fetchImpl: async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return fetchImpl(url, options); }
  });
  return { streamApiCall, requests };
};

test('a reply: straight to OpenAI with the key of the person, the text read from the stream', async () => {
  const chunks = SSE([{ type: 'response.output_text.delta', delta: 'Hel' }, { type: 'response.output_text.delta', delta: 'lo' }, { type: 'response.completed', response: { output: [] } }]);
  const { streamApiCall, requests } = harness({ apiId: 'gpt-6-luna', fetchImpl: async () => reply({ chunks }) });
  const seen = [];
  const text = await streamApiCall([{ text: 'Hello' }], (chunk) => seen.push(chunk), undefined, false, { reasoningEffort: 'low' });
  assert.equal(text, 'Hello');
  const [{ url, options, body }] = requests;
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(options.headers.Authorization, 'Bearer sk-secret');
  assert.equal(body.model, 'gpt-6-luna');
  assert.equal(body.store, false);
  assert.equal(body.safety_identifier, 'ident-1');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal('temperature' in body || 'top_p' in body, false);
  assert.equal('tools' in body, false, 'no search was asked for');
});

test('a reply that searches: OpenAI\'s tool when its search is chosen, nothing when the search service is', async () => {
  const done = () => async () => reply({ chunks: SSE([{ type: 'response.output_text.delta', delta: 'x' }, { type: 'response.completed', response: { output: [] } }]) });
  const withSearch = harness({ apiId: 'gpt-6-luna', fetchImpl: done(), conversation: { isWebSearchEnabled: true } });
  await withSearch.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, {});
  assert.deepEqual(withSearch.requests[0].body.tools, [{ type: 'web_search' }]);
  const service = harness({ apiId: 'gpt-6-luna', fetchImpl: done(), config: { openaiWebSearch: 'provider' }, conversation: { isWebSearchEnabled: true } });
  await service.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, {});
  assert.equal('tools' in service.requests[0].body, false);
  const sources = [];
  const cited = harness({ apiId: 'gpt-6-luna', conversation: { isWebSearchEnabled: true }, fetchImpl: async () => reply({ chunks: SSE([{ type: 'response.output_text.delta', delta: 'x' }, { type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'x', annotations: [{ type: 'url_citation', url: 'https://a.example', title: 'A' }] }] }] } }]) }) });
  await cited.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, { onSources: (found) => sources.push(...found) });
  assert.deepEqual(sources, [{ title: 'A', url: 'https://a.example' }]);
});

test('a refusal of OpenAI is shown with its own words', async () => {
  const { streamApiCall } = harness({ apiId: 'gpt-6-luna', fetchImpl: async () => reply({ ok: false, status: 401, body: JSON.stringify({ error: { message: 'Incorrect API key provided: sk-...' } }) }) });
  await assert.rejects(() => streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, {}), (error) => error.status === 401 && /Incorrect API key/.test(error.message));
});
