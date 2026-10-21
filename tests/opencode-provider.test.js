import assert from 'node:assert/strict';
import test from 'node:test';

import handler from '../api/opencode-chat.js';
import { applyAnthropicTools, buildAnthropicMessages, createAnthropicCollector } from '../src/app/runtime/reply/anthropic-messages-format.js';
import { opencodeErrorHint, opencodeErrorMessage } from '../src/app/runtime/reply/opencode-errors.js';
import { OPENCODE_CHAT_PATH, buildOpencodeRequest } from '../src/app/runtime/reply/opencode-request.js';
import { createStreamApiCall } from '../src/app/runtime/reply/stream-api-call.js';
import { applyOpenAiTools, modelThinkingKind } from '../src/app/runtime/features/tool-call-formats.js';
import { MODELS, getModelApiId, getModelReasoningConfig, normalizeReasoningEffort, getModelTiers, getProviderLabel, modelSupportsDocumentUpload, modelSupportsToolCalling, modelSupportsUploadedFile, modelSupportsVision, modelSupportsWebSearch } from '../src/app/runtime/shell/model-registry.js';
import { OPENCODE_GO_MODELS, OPENCODE_FORMATS, OPENCODE_REASONING_CONFIGS, opencodeFormatOf, opencodeThinkingFields } from '../src/app/runtime/shell/opencode-models.js';
import { createUpstreamFetch } from '../server/upstream-fetch.js';

const model = (apiId) => MODELS.find((entry) => entry.id === `opencode-go/${apiId}`);
const byteStream = (chunks) => {
  const encoder = new TextEncoder();
  return new ReadableStream({ start(controller) { chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk))); controller.close(); } });
};
const reply = ({ ok = true, status = 200, chunks = [], body } = {}) => ({ ok, status, statusText: '', body: byteStream(chunks), text: async () => body ?? '', json: async () => JSON.parse(body ?? '{}') });

test('the list of OpenCode Go models: the ones of the owner\'s table, each in one of the three forms of API, with the pictures the owner confirmed', () => {
  assert.equal(OPENCODE_GO_MODELS.length, 35);
  assert.equal(new Set(OPENCODE_GO_MODELS.map((entry) => entry.id)).size, 35);
  for (const entry of OPENCODE_GO_MODELS) {
    assert.ok(OPENCODE_FORMATS.includes(opencodeFormatOf(entry)), entry.id);
    assert.equal(entry.provider, 'opencode-go');
    assert.ok(MODELS.some((listed) => listed.id === entry.id), `${entry.id} is in the list of the app`);
    assert.ok(!entry.name.startsWith('OpenCode'), `${entry.id} is shown by its own name, without OpenCode in front`);
    assert.ok(modelSupportsToolCalling(entry), `${entry.id} calls tools`);
    assert.ok(modelSupportsWebSearch(entry), `${entry.id} searches the web (through the search tool)`);
  }
  const forms = (format) => OPENCODE_GO_MODELS.filter((entry) => entry.opencodeFormat === format).map((entry) => entry.apiId);
  assert.deepEqual(forms('responses').sort(), ['gpt-5.6-luna', 'gpt-6-luna', 'grok-4.6', 'grok-4.7', 'muse-spark-1.2-contributor', 'muse-spark-1.3-contributor']);
  assert.deepEqual(forms('gemini'), ['gemini-4-argon-contributor']);
  assert.deepEqual(forms('messages').sort(), ['claude-haiku-5-5', 'minimax-m2.7', 'minimax-m3', 'minimax-m3.1-flash-free', 'qwen3.7-plus', 'qwen3.8-flash', 'qwen3.8-max']);
  const noPictures = OPENCODE_GO_MODELS.filter((entry) => !modelSupportsVision(entry)).map((entry) => entry.apiId).sort();
  assert.deepEqual(noPictures, ['beam-free', 'cat-jam-free', 'deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2', 'glm-5.3', 'hy3', 'hy4-preview', 'longcat-2.0', 'mimo-v2.5-pro', 'minimax-m2.7']);
  assert.ok(modelSupportsVision(model('minimax-m3')) && modelSupportsVision(model('longcat-2.5-preview-free')) && modelSupportsVision(model('muse-spark-1.3-contributor')));
  assert.deepEqual(getModelTiers(model('step-5-preview-free')), ['free']);
  // The two of 2026-10-20 (the owner's probe): free; Beam is a hidden test model; MiniMax M3.1 Flash sees pictures, Beam is text only.
  for (const apiId of ['minimax-m3.1-flash-free', 'beam-free']) assert.deepEqual(getModelTiers(model(apiId)), ['free'], apiId);
  assert.equal(model('minimax-m3.1-flash-free').hiddenModel, undefined, 'MiniMax M3.1 Flash is in the list of the documents');
  assert.deepEqual([model('beam-free').hiddenModel, model('beam-free').requiresStealthTermsAcknowledgement], [true, true], 'Beam is a test model (the owner)');
  assert.ok(modelSupportsVision(model('minimax-m3.1-flash-free')));
  assert.equal(modelSupportsVision(model('beam-free')), false);
  // The two hidden test models: marked as hidden and asked about the first time they are chosen; Cat Jam is free, Space Bunny is not (a Go plan model).
  for (const apiId of ['cat-jam-free', 'space-bunny']) {
    assert.equal(model(apiId).hiddenModel, true, apiId);
    assert.equal(model(apiId).requiresStealthTermsAcknowledgement, true, apiId);
  }
  assert.deepEqual(getModelTiers(model('cat-jam-free')), ['free']);
  assert.deepEqual(getModelTiers(model('space-bunny')), ['paid'], 'Space Bunny is not free');
  assert.equal(OPENCODE_GO_MODELS.filter((entry) => entry.hiddenModel).length, 3, 'those two and Beam');
  assert.deepEqual(getModelTiers(model('kimi-k3')), ['paid']);
  assert.equal(getProviderLabel('opencode-go'), 'OpenCode Go');
  assert.equal(getModelApiId(model('kimi-k3')), 'kimi-k3');
  // The form is the one of this list, not what the page says.
  assert.equal(opencodeFormatOf({ provider: 'opencode-go', id: 'opencode-go/kimi-k3', opencodeFormat: 'messages' }), 'chat');
  assert.equal(opencodeFormatOf({ provider: 'openrouter', id: 'opencode-go/kimi-k3' }), '');
  // A member of a council on the server is named by the id at OpenCode.
  assert.equal(opencodeFormatOf({ provider: 'opencode-go', id: 'qwen3.8-max' }), 'messages');
  assert.equal(opencodeFormatOf({ provider: 'opencode-go', id: 'grok-4.7' }), 'responses');
  assert.equal(modelSupportsVision({ provider: 'opencode-go', id: 'kimi-k3' }), true);
  assert.equal(modelSupportsVision({ provider: 'opencode-go', id: 'glm-5.3' }), false);
});

test('thinking is shown as a summary for Claude, GPT, Grok and Muse, and as the model\'s own for the others', () => {
  for (const id of ['claude-haiku-5-5', 'gpt-6-luna', 'grok-4.7', 'muse-spark-1.3-contributor']) assert.equal(modelThinkingKind('opencode-go', id), 'summary');
  for (const id of ['kimi-k3', 'glm-5.3', 'minimax-m3', 'qwen3.8-max']) assert.equal(modelThinkingKind('opencode-go', id), 'raw');
});

test('a request to OpenCode: the form of the model, our path, the key and the session as headers, no thinking settings, no temperature', () => {
  const common = {
    modelId: 'x', apiKey: 'oc_sk_secret', sessionId: 'conv-1', modelInfo: { name: 'OpenCode X' }, historyForApi: [{ role: 'user', parts: [{ text: 'Hi' }] }, { role: 'model', parts: [{ text: 'Hello' }] }],
    currentMessageForApi: { role: 'user', parts: [{ text: 'Next' }] }, generationConfig: { temperature: 0.7, topP: 0.9, maxTokens: null }, systemInstruction: { parts: [{ text: 'Be kind.' }] },
    modelSupportsVision: () => true, buildChatMessages: () => [{ role: 'user', content: 'chat messages' }], buildResponsesInput: (messages) => messages.map((message) => ({ role: message.role, content: [] }))
  };
  const chat = buildOpencodeRequest({ ...common, format: 'chat' });
  assert.equal(chat.url, `${OPENCODE_CHAT_PATH}?format=chat`);
  assert.deepEqual(chat.headers, { Authorization: 'Bearer oc_sk_secret', 'Content-Type': 'application/json', 'x-opencode-session': 'conv-1' });
  assert.deepEqual(chat.payload, { model: 'x', messages: [{ role: 'user', content: 'chat messages' }], stream: true, stream_options: { include_usage: true } });

  const responses = buildOpencodeRequest({ ...common, format: 'responses', generationConfig: { maxTokens: 500 } });
  assert.equal(responses.url, `${OPENCODE_CHAT_PATH}?format=responses`);
  assert.deepEqual(Object.keys(responses.payload).sort(), ['input', 'instructions', 'max_output_tokens', 'model', 'stream']);
  assert.equal(responses.payload.instructions, 'Be kind.');

  const messages = buildOpencodeRequest({ ...common, format: 'messages' });
  assert.equal(messages.url, `${OPENCODE_CHAT_PATH}?format=messages`);
  assert.equal(messages.payload.system, 'Be kind.');
  assert.equal(messages.payload.max_tokens, 16384);
  assert.deepEqual(messages.payload.messages.map((entry) => entry.role), ['user', 'assistant', 'user']);
  assert.equal(JSON.stringify(messages.payload).includes('temperature'), false);

  // OpenCode refuses a request with no session id: one without a conversation gets an id of the page, the same every time.
  const noSession = buildOpencodeRequest({ ...common, sessionId: '', format: 'chat' });
  assert.match(noSession.headers['x-opencode-session'], /^[A-Za-z0-9._-]{1,100}$/);
  assert.equal(buildOpencodeRequest({ ...common, sessionId: undefined, format: 'chat' }).headers['x-opencode-session'], noSession.headers['x-opencode-session']);

  // Google's form: the model in the path, the body made by the page's Gemini builder, no `stream`.
  const gemini = buildOpencodeRequest({ ...common, modelId: 'gemini-4-argon-contributor', format: 'gemini', buildGeminiPayload: () => ({ contents: [] }) });
  assert.equal(gemini.url, `${OPENCODE_CHAT_PATH}?format=gemini&model=gemini-4-argon-contributor`);
  assert.deepEqual(gemini.payload, { contents: [] });
  assert.equal(gemini.headers['x-opencode-session'], 'conv-1');
});

test('the conversation in the Messages form: pictures as base64 blocks, other files named, roles that alternate, the first one the user\'s', () => {
  const info = { name: 'OpenCode Haiku' };
  const built = buildAnthropicMessages([
    { role: 'model', parts: [{ text: 'Leading answer' }] },
    { role: 'user', parts: [{ text: 'Look' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }, { inlineData: { mimeType: 'application/pdf', data: 'BBBB', name: 'a.pdf' } }] },
    { role: 'user', parts: [{ text: 'and also' }] },
    { role: 'model', parts: [{ text: '' }] },
    { role: 'model', parts: [{ text: 'Done' }] }
  ], { modelInfo: info, modelSupportsVision: () => true });
  assert.deepEqual(built.map((entry) => entry.role), ['user', 'assistant']);
  assert.deepEqual(built[0].content.map((block) => block.type), ['text', 'image', 'text', 'text']);
  assert.deepEqual(built[0].content[1].source, { type: 'base64', media_type: 'image/png', data: 'AAAA' });
  assert.match(built[0].content[2].text, /Attachment omitted for OpenCode Haiku: a\.pdf/);
  const blind = buildAnthropicMessages([{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }], { modelInfo: info, modelSupportsVision: () => false });
  assert.match(blind[0].content[0].text, /Attachment omitted/);
});

const SSE = (events) => events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);

test('the collector of the Messages stream: text, thinking with its signature, a tool call in pieces, and what it sends back with the answer of the tool', () => {
  const seenThinking = [];
  const seenArguments = [];
  const collector = createAnthropicCollector({ onReasoning: (chunk) => seenThinking.push(chunk), onToolArguments: (call) => seenArguments.push(call.arguments) });
  const visible = [];
  for (const event of [
    { type: 'message_start', message: { id: 'm1' } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Let me ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'see.' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'I will search.' } },
    { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: {} } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
    { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"noureon"}' } },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    { type: 'ping' }
  ]) visible.push(collector.add(event));
  assert.equal(visible.join(''), 'I will search.');
  assert.equal(seenThinking.join(''), 'Let me see.');
  assert.equal(seenArguments.at(-1), '{"query":"noureon"}');
  const result = collector.result();
  assert.equal(result.text, 'I will search.');
  assert.equal(result.finishReason, 'tool_use');
  assert.deepEqual(result.toolCalls, [{ id: 'toolu_1', name: 'web_search', arguments: '{"query":"noureon"}', args: { query: 'noureon' } }]);
  assert.deepEqual(result.contentBlocks.map((block) => block.type), ['thinking', 'text', 'tool_use']);
  assert.equal(result.contentBlocks[0].signature, 'sig');

  const payload = { messages: [{ role: 'user', content: [{ type: 'text', text: 'Search' }] }] };
  applyAnthropicTools(payload, { tools: [{ name: 'web_search', description: 'Search', parameters: { type: 'object' } }], toolTurns: [{ assistant: result, results: [{ id: 'toolu_1', name: 'web_search', content: 'found' }] }] });
  assert.deepEqual(payload.tools, [{ name: 'web_search', description: 'Search', input_schema: { type: 'object' } }]);
  assert.deepEqual(payload.tool_choice, { type: 'auto' });
  assert.deepEqual(payload.messages.slice(1).map((entry) => entry.role), ['assistant', 'user']);
  assert.deepEqual(payload.messages[1].content.map((block) => block.type), ['thinking', 'text', 'tool_use']);
  assert.deepEqual(payload.messages[2].content, [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'found' }]);

  const failing = createAnthropicCollector();
  failing.add({ type: 'error', error: { message: 'overloaded' } });
  assert.equal(failing.failure, 'overloaded');
  // Rounds that did not keep the blocks (a reply taken up again) are rebuilt from the text and the calls.
  const rebuilt = { messages: [] };
  applyAnthropicTools(rebuilt, { toolTurns: [{ assistant: { text: 'T', toolCalls: [{ id: 'c', name: 'n', args: { a: 1 } }] }, results: [{ id: 'c', content: 'r' }] }] });
  assert.deepEqual(rebuilt.messages[0].content, [{ type: 'text', text: 'T' }, { type: 'tool_use', id: 'c', name: 'n', input: { a: 1 } }]);
});

test('the answer of a tool goes back to a model of the chat form without the details of the thinking OpenRouter sends (the service refuses a field it does not know)', () => {
  const turn = { assistant: { text: '', toolCalls: [{ id: 'c1', name: 'get_time', arguments: '{}' }], reasoningDetails: [{ type: 'x' }] }, results: [{ id: 'c1', content: '14:05' }] };
  const kept = applyOpenAiTools({ messages: [] }, { toolTurns: [turn] });
  const dropped = applyOpenAiTools({ messages: [] }, { toolTurns: [turn], reasoningDetails: false });
  assert.ok(kept.messages[0].reasoning_details);
  assert.equal('reasoning_details' in dropped.messages[0], false);
});

const harness = ({ apiId, fetchImpl, conversation = {}, language = 'en' }) => {
  const info = model(apiId);
  const requests = [];
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => ({ id: 'conv-42', model: info.id, messages: [{ role: 'user', parts: [{ text: 'Hello' }] }], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: null }, ...conversation }),
    normalizeConversationModel: () => info,
    getModelApiId,
    getApiKeyForProvider: () => 'oc_sk_secret',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'en', uiLanguage: language, isLearningMode: false, memoryEnabled1: false }),
    getAstras: () => [],
    getPersonalMemories: () => [],
    modelSupportsUploadedFile: () => true,
    modelSupportsVision,
    fetchImpl: async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return fetchImpl(url, options); }
  });
  return { streamApiCall, requests };
};

test('a reply in each of the three forms: the request, and the text and the thinking read from the stream', async () => {
  const streams = {
    'kimi-k3': ['data: {"choices":[{"delta":{"reasoning":"hm"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n', 'data: [DONE]\n\n'],
    'gpt-6-luna': SSE([{ type: 'response.reasoning_summary_text.delta', delta: 'hm' }, { type: 'response.output_text.delta', delta: 'Hel' }, { type: 'response.output_text.delta', delta: 'lo' }, { type: 'response.completed', response: { output: [] } }]),
    'qwen3.8-max': SSE([{ type: 'message_start' }, { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }, { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hm' } }, { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Hel' } }, { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'lo' } }, { type: 'message_stop' }])
  };
  for (const [apiId, chunks] of Object.entries(streams)) {
    const { streamApiCall, requests } = harness({ apiId, fetchImpl: async () => reply({ chunks }) });
    const thoughts = [];
    const chunksSeen = [];
    const text = await streamApiCall([{ text: 'Hello' }], (chunk) => chunksSeen.push(chunk), undefined, false, { onReasoning: (chunk) => thoughts.push(chunk) });
    assert.equal(text, 'Hello', apiId);
    assert.equal(thoughts.join(''), 'hm', apiId);
    const [{ url, options, body }] = requests;
    assert.equal(url, `/api/opencode-chat?format=${opencodeFormatOf(model(apiId))}`);
    assert.equal(options.headers.Authorization, 'Bearer oc_sk_secret');
    assert.equal(options.headers['x-opencode-session'], 'conv-42');
    assert.equal(body.model, apiId);
    assert.equal('temperature' in body || 'top_p' in body || 'thinking' in body || 'reasoning_effort' in body, false);
  }
});

test('a refusal of OpenCode says what to do, in the language of the page, before the words of the service', async () => {
  const refuse = (status, message) => async () => reply({ ok: false, status, body: JSON.stringify({ error: { message } }) });
  const ask = async (status, message, language) => {
    const { streamApiCall } = harness({ apiId: 'deepseek-v4-pro', fetchImpl: refuse(status, message), language });
    try {
      await streamApiCall([{ text: 'Hello' }], () => {});
    } catch (error) {
      return error;
    }
    return null;
  };
  const region = await ask(400, 'Upstream request failed: This Go model requires Global regions. Select Global in your workspace\'s Privacy settings to use it.', 'en');
  assert.match(region.message, /^This model needs the region set to Global/);
  assert.match(region.message, /requires Global regions/);
  assert.doesNotMatch(region.message, /^Upstream request failed/);
  const training = await ask(400, 'Upstream request failed: This Go model trains on request data. Allow paid endpoints that train on request data in your workspace\'s Privacy settings to use it.', 'zh-TW');
  assert.match(training.message, /^這個模型會用你的請求資料訓練/);
  const key = await ask(401, 'Upstream request failed: Invalid credential', 'fr');
  assert.match(key.message, /n’accepte pas cette clé/);
  const limit = await ask(429, 'Upstream request failed: Account budget exceeded', 'es');
  assert.match(limit.message, /límites de la consola/);
  assert.equal(key.status, 401);
  // An error that is only a text, not an object.
  const plainText = await (async () => {
    const { streamApiCall } = harness({ apiId: 'kimi-k3', fetchImpl: async () => reply({ ok: false, status: 500, body: JSON.stringify({ error: 'boom' }) }) });
    return streamApiCall([{ text: 'Hello' }], () => {}).catch((error) => error);
  })();
  assert.equal(plainText.message, 'boom');
});

test('the hints: each known reason has a line in the five languages, and an unknown reason has none', async () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const [status, message] of [[400, 'requires Global regions'], [400, 'trains on request data'], [401, 'Invalid credential'], [429, 'Account budget exceeded'], [404, 'Endpoint is unavailable.']]) {
      assert.ok((await opencodeErrorHint({ status, message, language })).length > 10, `${language} ${message}`);
    }
  }
  assert.equal(await opencodeErrorHint({ status: 500, message: 'something else', language: 'en' }), '');
  assert.equal(await opencodeErrorMessage({ status: 500, message: 'Upstream request failed: something else', language: 'en' }), 'something else');
});

test('the server\'s fetch sends the path of OpenCode straight to the service, with the headers it wants, and nothing else the page sent', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return reply({}); };
  const upstream = createUpstreamFetch({ fetchImpl });
  const body = JSON.stringify({ model: 'x', messages: [] });
  for (const [format, path] of [['chat', '/chat/completions'], ['responses', '/responses'], ['messages', '/messages']]) {
    await upstream(`/api/opencode-chat?format=${format}`, { method: 'POST', headers: { Authorization: 'Bearer oc_sk_secret', 'x-opencode-session': 'conv-42', 'x-evil': 'no' }, body });
    const call = calls.at(-1);
    assert.equal(call.url, `https://opencode.ai/inference/go/v1${path}`);
    assert.equal(call.options.headers.Authorization, 'Bearer oc_sk_secret');
    assert.equal(call.options.headers['x-opencode-session'], 'conv-42');
    assert.match(call.options.headers['User-Agent'], /^Noureon\//);
    assert.equal('x-evil' in call.options.headers, false);
    assert.equal(call.options.body, body);
  }
  const unknown = await upstream('/api/opencode-chat?format=other', { method: 'POST', headers: { Authorization: 'Bearer k' }, body });
  assert.equal(unknown.status, 400);
  const noKey = await upstream('/api/opencode-chat', { method: 'POST', body });
  assert.equal(noKey.status, 401);
  await upstream('/api/opencode-chat', { method: 'POST', headers: { Authorization: 'Bearer k', 'x-opencode-session': 'bad session!' }, body });
  // No session id is not sent on as nothing: OpenCode refuses it, so one is made.
  assert.match(calls.at(-1).options.headers['x-opencode-session'], /^noureon-/);
  await upstream('/api/opencode-chat', { method: 'POST', headers: { Authorization: 'Bearer k' }, body });
  assert.match(calls.at(-1).options.headers['x-opencode-session'], /^noureon-/);
  // Google's form: the model in the path, the stream as lines of text, the key as a Bearer like the others (the probe of 2026-10-14).
  await upstream('/api/opencode-chat?format=gemini&model=gemini-4-argon-contributor', { method: 'POST', headers: { Authorization: 'Bearer oc_sk_secret', 'x-opencode-session': 'conv-42' }, body });
  assert.equal(calls.at(-1).url, 'https://opencode.ai/inference/go/v1/models/gemini-4-argon-contributor:streamGenerateContent?alt=sse');
  assert.equal(calls.at(-1).options.headers.Accept, 'text/event-stream');
  assert.equal('x-goog-api-key' in calls.at(-1).options.headers, false);
  const badModel = await upstream('/api/opencode-chat?format=gemini&model=../x', { method: 'POST', headers: { Authorization: 'Bearer k' }, body });
  assert.equal(badModel.status, 400);
  const noModel = await upstream('/api/opencode-chat?format=gemini', { method: 'POST', headers: { Authorization: 'Bearer k' }, body });
  assert.equal(noModel.status, 400);
});

test('Gemini 4 Argon Contributor: Google\'s form, streamed as lines of text with thought summaries; a picture goes as inline data; no sampling numbers or Google search; a tool call is read', async () => {
  const lines = (...events) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`);
  const chunks = lines(
    { candidates: [{ content: { role: 'model', parts: [{ text: 'hm', thought: true }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Hel' }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'lo', thoughtSignature: 'sig' }] } }], usageMetadata: { totalTokenCount: 9 } }
  );
  const { streamApiCall, requests } = harness({ apiId: 'gemini-4-argon-contributor', fetchImpl: async () => reply({ chunks }) });
  const seen = [];
  const thoughts = [];
  const text = await streamApiCall([{ text: 'Hello' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }], (chunk) => seen.push(chunk), undefined, false, { onReasoning: (chunk) => thoughts.push(chunk), forceWebSearch: true });
  assert.equal(text, 'Hello');
  assert.equal(seen.join(''), 'Hello');
  assert.equal(thoughts.join(''), 'hm');
  assert.equal(modelThinkingKind('opencode-go', 'gemini-4-argon-contributor'), 'summary');
  const [{ url, options, body }] = requests;
  assert.equal(url, '/api/opencode-chat?format=gemini&model=gemini-4-argon-contributor');
  assert.equal(options.headers['x-opencode-session'], 'conv-42');
  assert.ok(body.contents.length > 0 && body.contents.at(-1).parts.some((part) => part.inlineData));
  assert.equal('model' in body || 'stream' in body || 'tools' in body, false);
  assert.equal(JSON.stringify(body).includes('temperature') || JSON.stringify(body).includes('topP'), false);
  // The summaries of the thinking are asked for (the probe: they come at medium and high), and the depth is the one of the app.
  assert.equal(body.generationConfig.thinkingConfig.includeThoughts, true);

  const call = lines({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'run_python', args: { code: '1+1' } } }] } }] });
  const tool = { name: 'run_python', description: 'Runs code', parameters: { type: 'object', properties: { code: { type: 'string' } } } };
  const second = harness({ apiId: 'gemini-4-argon-contributor', fetchImpl: async () => reply({ chunks: call }) });
  let collected = null;
  await second.streamApiCall([{ text: 'Run it' }], () => {}, undefined, false, { tools: [tool], toolTurns: [], onResponseComplete: (value) => { collected = value; } });
  assert.deepEqual(collected.toolCalls[0].args, { code: '1+1' });
  assert.ok(second.requests[0].body.tools, 'the tool is sent');
});

const fakeResponse = () => {
  const out = { status: 0, headers: {}, chunks: [], ended: false, json: null, listeners: {}, writableEnded: false };
  const res = {
    status(code) { out.status = code; return res; },
    setHeader(name, value) { out.headers[name.toLowerCase()] = value; },
    json(value) { out.json = value; out.ended = true; return res; },
    end(value) { if (value) out.chunks.push(value); out.ended = true; res.writableEnded = true; return res; },
    write(chunk) { out.chunks.push(chunk); return true; },
    flushHeaders() {},
    on(name, listener) { out.listeners[name] = listener; }
  };
  return { res, out };
};

test('the function for the browser: a path for each form, the key and the session passed on, the User-Agent of Noureon, the stream passed through', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }), body: byteStream(['data: {"a":1}\n\n']), text: async () => '' }; };
  try {
    const { res, out } = fakeResponse();
    await handler({ method: 'POST', query: { format: 'messages' }, headers: { authorization: 'Bearer oc_sk_secret', 'x-opencode-session': 'conv-42' }, body: { model: 'x' } }, res);
    assert.equal(calls[0].url, 'https://opencode.ai/inference/go/v1/messages');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer oc_sk_secret');
    assert.equal(calls[0].options.headers['x-opencode-session'], 'conv-42');
    assert.match(calls[0].options.headers['User-Agent'], /^Noureon\//);
    assert.equal(calls[0].options.body, JSON.stringify({ model: 'x' }));
    assert.equal(out.status, 200);
    assert.equal(Buffer.concat(out.chunks).toString(), 'data: {"a":1}\n\n');

    const bad = fakeResponse();
    await handler({ method: 'POST', query: { format: 'nope' }, headers: { authorization: 'Bearer k' }, body: {} }, bad.res);
    assert.equal(bad.out.status, 400);
    const noKey = fakeResponse();
    await handler({ method: 'POST', query: {}, headers: {}, body: {} }, noKey.res);
    assert.equal(noKey.out.status, 401);
    const get = fakeResponse();
    await handler({ method: 'GET', query: {}, headers: {} }, get.res);
    assert.equal(get.out.status, 405);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a tool round in each form (what Python, connectors, skills, command tools and the search of a research reply all use): the call is read, and the answer of the tool goes back in the shape the form wants', async () => {
  const tool = { name: 'run_python', description: 'Runs code', parameters: { type: 'object', properties: { code: { type: 'string' } } } };
  const calls = {
    'kimi-k3': ['data: {"choices":[{"delta":{"reasoning":"hm","tool_calls":[{"index":0,"id":"call_1","function":{"name":"run_python","arguments":"{\\"code\\":"}}]}}]}\n\n', 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"1+1\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n', 'data: [DONE]\n\n'],
    'grok-4.7': SSE([{ type: 'response.output_item.added', item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'run_python' } }, { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"code":"1+1"}' }, { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'run_python', arguments: '{"code":"1+1"}' } }, { type: 'response.completed', response: { output: [{ type: 'reasoning', id: 'rs_1' }, { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'run_python', arguments: '{"code":"1+1"}' }] } }]),
    'claude-haiku-5-5': SSE([{ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'run_python', input: {} } }, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"code":"1+1"}' } }, { type: 'message_delta', delta: { stop_reason: 'tool_use' } }])
  };
  for (const [apiId, chunks] of Object.entries(calls)) {
    const { streamApiCall, requests } = harness({ apiId, fetchImpl: async () => reply({ chunks }) });
    let collected = null;
    await streamApiCall([{ text: 'Run it' }], () => {}, undefined, false, { tools: [tool], toolTurns: [], onResponseComplete: (value) => { collected = value; } });
    assert.equal(collected.toolCalls.length, 1, apiId);
    assert.equal(collected.toolCalls[0].name, 'run_python');
    assert.deepEqual(collected.toolCalls[0].args, { code: '1+1' });
    const first = requests[0].body;
    assert.ok(first.tools.length === 1, `${apiId} sends the tool`);
    assert.equal(first.tool_choice === 'auto' || first.tool_choice?.type === 'auto', true);

    const second = harness({ apiId, fetchImpl: async () => reply({ chunks: [] }) });
    await second.streamApiCall([{ text: 'Run it' }], () => {}, undefined, false, { tools: [tool], toolTurns: [{ assistant: collected, results: [{ id: collected.toolCalls[0].id, name: 'run_python', content: '2' }] }] });
    const body = second.requests[0].body;
    const text = JSON.stringify(body);
    assert.ok(text.includes('"2"'), `${apiId} sends the answer of the tool`);
    if (apiId === 'kimi-k3') {
      assert.deepEqual(body.messages.slice(-2).map((message) => message.role), ['assistant', 'tool']);
      assert.equal('reasoning_details' in body.messages.at(-2), false);
    } else if (apiId === 'grok-4.7') {
      assert.deepEqual(body.input.slice(-2).map((item) => item.type), ['function_call', 'function_call_output']);
    } else {
      assert.deepEqual(body.messages.slice(-2).map((message) => message.role), ['assistant', 'user']);
      assert.equal(body.messages.at(-1).content[0].type, 'tool_result');
      assert.equal(body.messages.at(-2).content[0].type, 'tool_use');
    }
  }
});

test('the depth of thinking of each model: the options of the slider, and the fields that say it in the way of the model (the ones the probe found accepted)', () => {
  // The slider is the one of the app: the models that have a choice get a row in its table.
  assert.equal(Object.keys(OPENCODE_REASONING_CONFIGS).length, 32);
  const config = getModelReasoningConfig(model('kimi-k3'));
  assert.deepEqual([config.options, config.defaultEffort], [['none', 'low', 'medium', 'high', 'max'], 'high']);
  assert.equal(normalizeReasoningEffort(model('kimi-k3'), 'xhigh'), 'high');
  // The models with no choice (their depths do nothing, or they cannot stop) have none.
  for (const apiId of ['glm-5.3-flash', 'space-bunny', 'minimax-m2.7']) assert.equal(getModelReasoningConfig(model(apiId)), null, apiId);

  const fields = (apiId, effort) => opencodeThinkingFields(model(apiId), effort);
  assert.deepEqual(fields('kimi-k3', 'none'), { reasoning_effort: 'none' });
  assert.deepEqual(fields('deepseek-v4-pro', 'max'), { reasoning_effort: 'max' });
  assert.deepEqual(fields('longcat-2.0', 'none'), { thinking: { type: 'disabled' } });
  assert.deepEqual(fields('longcat-2.0', 'high'), {});
  assert.deepEqual(fields('cat-jam-free', 'xhigh'), { reasoning_effort: 'xhigh' });
  assert.deepEqual(fields('cat-jam-free', 'none'), {}, 'no none for Cat Jam: only the depths Pi maps to the API');
  assert.deepEqual(fields('minimax-m3', 'none'), { thinking: { type: 'disabled' } });
  assert.deepEqual(fields('grok-4.7', 'xhigh'), { reasoning: { effort: 'xhigh' } });
  assert.deepEqual(fields('muse-spark-1.3-contributor', 'minimal'), { reasoning: { effort: 'minimal' } });
  assert.deepEqual(fields('gemini-4-argon-contributor', 'high'), { generationConfig: { thinkingConfig: { thinkingLevel: 'high' } } });
  assert.deepEqual(fields('gemini-4-argon-contributor', 'minimal'), {}, 'minimal is refused by the service');
  // The two of 2026-10-20: MiniMax M3.1 Flash is asked as Claude Haiku is (it cannot stop thinking); Beam takes the depths as `reasoning_effort`, never none or minimal.
  assert.deepEqual(fields('minimax-m3.1-flash-free', 'high'), { thinking: { type: 'adaptive' }, output_config: { effort: 'high' } });
  assert.deepEqual(fields('minimax-m3.1-flash-free', 'none'), {}, 'its thinking cannot be turned off');
  assert.deepEqual(fields('beam-free', 'xhigh'), { reasoning_effort: 'xhigh' });
  assert.deepEqual(fields('beam-free', 'none'), {});
  assert.deepEqual(fields('claude-haiku-5-5', 'max'), { thinking: { type: 'adaptive' }, output_config: { effort: 'max' } });
  assert.deepEqual(fields('qwen3.8-max', 'low'), { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } });
  assert.deepEqual(fields('qwen3.8-max', 'none'), { thinking: { type: 'disabled' } });
  // Never a value the probe saw refused: no `none` for Muse, Grok, GLM, Step, Hy4, Kimi K2.7; no `max` for Grok and Muse 1.2; no `minimal` for the MiMo and GPT Luna.
  const refused = { 'muse-spark-1.3-contributor': ['none'], 'muse-spark-1.2-contributor': ['none', 'max'], 'grok-4.7': ['none', 'max'], 'grok-4.6': ['none', 'max'], 'glm-5.3': ['none'], 'glm-5.2': ['none'], 'step-5-preview-free': ['none'], 'kimi-k2.7-code': ['none'], 'mimo-v2.6-pro': ['minimal', 'xhigh', 'max'], 'gpt-6-luna': ['minimal'], 'gpt-5.6-luna': ['minimal'], 'deepseek-v4.1-flash': ['minimal'] };
  for (const [apiId, values] of Object.entries(refused)) for (const value of values) assert.equal(getModelReasoningConfig(model(apiId)).options.includes(value), false, `${apiId} ${value}`);
  // Another provider's model, an unknown depth: nothing.
  assert.deepEqual(opencodeThinkingFields({ provider: 'openrouter', id: 'opencode-go/kimi-k3' }, 'high'), {});
  assert.deepEqual(fields('kimi-k3', 'xhigh'), {});
});

test('a reply says the depth in the request, in the form of the model, and says nothing when no depth is asked for', async () => {
  const sent = async (apiId, effort) => {
    const info = model(apiId);
    const requests = [];
    const streamApiCall = createStreamApiCall({
      getActiveConversation: () => ({ id: 'c', model: info.id, messages: [{ role: 'user', parts: [{ text: 'Hi' }] }], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: null }, reasoningEffort: effort }),
      normalizeConversationModel: () => info,
      getModelApiId,
      getApiKeyForProvider: () => 'oc_sk_secret',
      getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
      getConfig: () => ({ aiDefaultLanguage: 'en', uiLanguage: 'en', isLearningMode: false, memoryEnabled1: false }),
      getAstras: () => [],
      getPersonalMemories: () => [],
      modelSupportsUploadedFile: () => true,
      modelSupportsVision,
      getModelReasoningConfig,
      normalizeReasoningEffort,
      fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return reply({ chunks: [] }); }
    });
    await streamApiCall([{ text: 'Hi' }], () => {});
    return requests[0];
  };
  assert.equal((await sent('kimi-k3', 'low')).reasoning_effort, 'low');
  assert.equal((await sent('kimi-k3', null)).reasoning_effort, 'high', 'the default of the model');
  assert.deepEqual((await sent('claude-haiku-5-5', 'xhigh')).output_config, { effort: 'xhigh' });
  assert.deepEqual((await sent('gpt-6-luna', 'none')).reasoning, { effort: 'none' });
  assert.deepEqual((await sent('qwen3.8-flash', 'none')).thinking, { type: 'disabled' });
  const plain = await sent('space-bunny', 'high');
  assert.equal('reasoning_effort' in plain || 'thinking' in plain, false);
});

test('a PDF goes to the models that read it (the probe of 2026-10-14), in the form of each API; any other file, and the other models, still go through the translator', async () => {
  const pdf = { inlineData: { mimeType: 'application/pdf', data: 'JVBERi0x', name: 'a.pdf' } };
  const docx = { inlineData: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: 'UEsDBA==', name: 'a.docx' } };
  const reads = ['hy3', 'grok-4.7', 'gpt-6-luna', 'claude-haiku-5-5', 'minimax-m3', 'minimax-m2.7', 'minimax-m3.1-flash-free', 'qwen3.8-max', 'muse-spark-1.3-contributor', 'gemini-4-argon-contributor'];
  const refuses = ['beam-free', 'deepseek-v4-flash', 'deepseek-v4.1-flash', 'mimo-v2.5', 'step-5-preview-free', 'glm-5.3', 'kimi-k3', 'kimi-k2.7-code', 'mimo-v2.6-pro', 'longcat-2.5-preview-free', 'cat-jam-free', 'deepseek-v4-flash-vision-exp', 'deepseek-v4-pro', 'space-bunny', 'longcat-2.0'];
  // Word and PowerPoint files as they are: only the five that answered MANGO to both in the probe; for every other model they are translated.
  const pptx = { inlineData: { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data: 'UEsDBA==', name: 'a.pptx' } };
  const officeReaders = ['grok-4.7', 'grok-4.6', 'gpt-6-luna', 'gpt-5.6-luna', 'gemini-4-argon-contributor'];
  for (const apiId of reads) {
    assert.equal(modelSupportsUploadedFile(model(apiId), pdf), true, `${apiId} reads a PDF`);
    assert.equal(modelSupportsUploadedFile(model(apiId), docx), officeReaders.includes(apiId), `${apiId}: a Word file ${officeReaders.includes(apiId) ? 'goes as it is' : 'is translated'}`);
    assert.equal(modelSupportsUploadedFile(model(apiId), pptx), officeReaders.includes(apiId), `${apiId}: a PowerPoint file`);
    assert.equal(modelSupportsUploadedFile(model(apiId), { inlineData: { mimeType: 'application/vnd.ms-excel', data: 'AA==' } }), false, `${apiId}: any other file is translated`);
    assert.equal(modelSupportsDocumentUpload(model(apiId)), false, `${apiId} is not a translator of any file`);
  }
  for (const apiId of refuses) assert.equal(modelSupportsUploadedFile(model(apiId), pdf), false, `${apiId} does not take a file`);

  const sent = async (apiId) => {
    const info = model(apiId);
    const requests = [];
    const streamApiCall = createStreamApiCall({
      getActiveConversation: () => ({ id: 'c', model: info.id, messages: [], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: null } }),
      normalizeConversationModel: () => info,
      getModelApiId,
      getApiKeyForProvider: () => 'oc_sk_secret',
      getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
      getConfig: () => ({ aiDefaultLanguage: 'en', uiLanguage: 'en', isLearningMode: false, memoryEnabled1: false }),
      getAstras: () => [],
      getPersonalMemories: () => [],
      modelSupportsUploadedFile,
      modelSupportsVision,
      getModelReasoningConfig,
      normalizeReasoningEffort,
      fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return reply({ chunks: [] }); }
    });
    await streamApiCall([{ text: 'What is in it?' }, pdf], () => {});
    return requests[0];
  };
  // content[1] is the line that numbers and names the file (attachment-labels.js), content[2] the file.
  const chat = (await sent('hy3')).messages[1].content[2];
  assert.deepEqual([chat.type, chat.file.filename, chat.file.file_data], ['file', 'a.pdf', 'data:application/pdf;base64,JVBERi0x']);
  const responses = (await sent('gpt-6-luna')).input[0].content[2];
  assert.deepEqual([responses.type, responses.filename, responses.file_data], ['input_file', 'a.pdf', 'data:application/pdf;base64,JVBERi0x']);
  const messages = (await sent('claude-haiku-5-5')).messages[0].content[2];
  assert.deepEqual(messages, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' } });
  // A model that does not read a file is not sent one.
  assert.equal(JSON.stringify(await sent('glm-5.3')).includes('JVBERi0x'), false);
});

test('the OpenCode models are shown by their own names, without OpenCode in front', () => {
  assert.equal(OPENCODE_GO_MODELS.find((entry) => entry.apiId === 'step-5-preview-free').name, 'Step 5 Preview');
  assert.equal(OPENCODE_GO_MODELS.find((entry) => entry.apiId === 'longcat-2.5-preview-free').name, 'LongCat 2.5 Preview');
  assert.equal(OPENCODE_GO_MODELS.find((entry) => entry.apiId === 'kimi-k3').name, 'Kimi K3');
});
