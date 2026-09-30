import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStreamApiCall } from '../src/app/legacy-runtime/features/stream-api-call.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const createByteStream = (chunks) => {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    }
  });
};

const createResponse = ({
  ok = true,
  status = 200,
  statusText = 'OK',
  streamChunks = [],
  jsonValue,
  textValue
} = {}) => ({
  ok,
  status,
  statusText,
  body: createByteStream(streamChunks),
  async json() {
    return jsonValue;
  },
  async text() {
    return textValue ?? JSON.stringify(jsonValue);
  }
});

const createHarness = ({
  provider = 'openrouter',
  modelInfo = {},
  conversation = {},
  config = {},
  astras = [],
  personalMemories = [],
  getMemoryContext,
  warn = () => {},
  fetchImpl,
  getActiveConversation,
  getModelReasoningConfig = () => null,
  normalizeReasoningEffort = () => null
} = {}) => {
  const resolvedModel = {
    id: `${provider}-model`,
    apiId: `${provider}/model`,
    name: `${provider} model`,
    provider,
    ...modelInfo
  };
  const resolvedConversation = {
    model: resolvedModel.id,
    messages: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    genConfig: { temperature: 0.4, topP: 0.8, maxTokens: 321 },
    isWebSearchEnabled: false,
    ...conversation
  };
  const requests = [];
  const runtimeFetch = fetchImpl || (async () => {
    return createResponse({
      streamChunks: [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
    });
  });

  const streamApiCall = createStreamApiCall({
    getActiveConversation: getActiveConversation || (() => resolvedConversation),
    normalizeConversationModel: () => resolvedModel,
    getModelApiId: (model) => model.apiId,
    getApiKeyForProvider: (requestedProvider) => `${requestedProvider}-key`,
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({
      aiDefaultLanguage: 'en',
      isLearningMode: false,
      memoryEnabled1: false,
      ...config
    }),
    getAstras: () => astras,
    getPersonalMemories: () => personalMemories,
    getMemoryContext,
    modelSupportsUploadedFile: () => true,
    modelSupportsVision: () => true,
    getModelReasoningConfig,
    normalizeReasoningEffort,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return runtimeFetch(url, options);
    },
    warn
  });

  return { streamApiCall, requests, modelInfo: resolvedModel, conversation: resolvedConversation };
};

test('consecutive corrected model messages become one provider turn for Gemini and OpenRouter', async () => {
  for (const provider of ['gemini', 'openrouter']) {
    const { streamApiCall, requests } = createHarness({
      provider,
      conversation: { messages: [
        { role: 'user', parts: [{ text: 'Make a deck' }] },
        { role: 'model', parts: [{ text: 'Original deck' }] },
        { role: 'model', parts: [{ text: 'Corrected deck' }] },
        { role: 'user', parts: [{ text: 'Next request' }] }
      ] }
    });
    await streamApiCall([{ text: 'Next request' }], () => {});
    const payload = JSON.parse(requests[0].options.body);
    const turns = provider === 'gemini' ? payload.contents : payload.messages.filter(message => message.role !== 'system');
    assert.deepEqual(turns.map(turn => turn.role), ['user', provider === 'gemini' ? 'model' : 'assistant', 'user']);
    assert.match(JSON.stringify(turns[1]), /Original deck.*Corrected deck/);
  }
});

test('vision requests omit conversation context, web search and file authoring guidance', async () => {
  const { streamApiCall, requests } = createHarness({ provider: 'gemini',
    conversation: { isWebSearchEnabled: true, astrasId: 'a' },
    astras: [{ id: 'a', instructions: 'Persona text' }],
    personalMemories: [{ enabled: true, content: 'Stored memory' }]
  });
  const parts = [{ text: 'Review slides' }, { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }];
  await streamApiCall(parts, () => {}, undefined, false, {
    requestPurpose: NOURAS_REQUEST_PURPOSE.VISION_CHECK,
    historyForApi: [], currentMessageForApi: { role: 'user', parts },
    ignoreConversationWebSearch: true, skipMemoryContext: true, skipConversationSystemContext: true
  });
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.systemInstruction, undefined);
  assert.equal(payload.tools, undefined);
  assert.equal(payload.contents.length, 1);
  assert.equal(payload.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
});

test('v2 memory injects only its filtered context and never the legacy memory list', async () => {
  const { streamApiCall, requests } = createHarness({
    config: { memorySystemVersion: 2 },
    personalMemories: [{ id: 'legacy-name', content: 'Always call the user Allen', enabled: true }],
    getMemoryContext: () => ({
      currentChatSummary: '',
      instructions: ['Do not use stored names as unsolicited forms of address.'],
      profileEntries: [{ id: 'language', kind: 'preference', content: '使用繁體中文回答' }],
      historyResults: []
    })
  });

  await streamApiCall([{ text: 'Hello' }], () => {});

  const payload = JSON.parse(requests[0].options.body);
  const systemMessage = payload.messages.find(message => message.role === 'system');
  assert.match(systemMessage.content, /使用繁體中文回答/);
  assert.match(systemMessage.content, /Do not use stored names/);
  assert.doesNotMatch(systemMessage.content, /Always call the user Allen/);
  assert.doesNotMatch(systemMessage.content, /legacy-name|language/);
});

const ASTRA_FIXTURE = {
  id: 'official-writer-01',
  name: '旅遊小編',
  instructions: 'Write as a high-end travel magazine editor with a warm, vivid voice.'
};

const readSystemMessage = (requests) => {
  const payload = JSON.parse(requests[0].options.body);
  return payload.messages.find(message => message.role === 'system').content;
};

test('learning mode keeps the selected Noura instead of replacing it', async () => {
  const { streamApiCall, requests } = createHarness({
    config: { isLearningMode: true, uiLanguage: 'en' },
    conversation: { astrasId: ASTRA_FIXTURE.id },
    astras: [ASTRA_FIXTURE]
  });

  await streamApiCall([{ text: 'Teach me about tides' }], () => {}, undefined, false, {
    requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER
  });

  const systemMessage = readSystemMessage(requests);
  assert.match(systemMessage, /high-end travel magazine editor/);
  assert.match(systemMessage, /Learning Mode/);
  assert.match(systemMessage, /Learning Mode wins/);
});

test('learning mode rules are stated after the Noura so teaching rules win on conflict', async () => {
  const { streamApiCall, requests } = createHarness({
    config: { isLearningMode: true, uiLanguage: 'en' },
    conversation: { astrasId: ASTRA_FIXTURE.id },
    astras: [ASTRA_FIXTURE]
  });

  await streamApiCall([{ text: 'Teach me about tides' }], () => {}, undefined, false, {
    requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER
  });

  const systemMessage = readSystemMessage(requests);
  const astraIndex = systemMessage.indexOf('high-end travel magazine editor');
  const precedenceIndex = systemMessage.indexOf('Learning Mode wins');
  assert.ok(astraIndex >= 0 && precedenceIndex > astraIndex, 'precedence clause should follow the Noura instructions');
});

test('precedence clause disarms persona-triggered direct answers, not learner requests', async () => {
  const { streamApiCall, requests } = createHarness({
    config: { isLearningMode: true, uiLanguage: 'en' },
    conversation: { astrasId: ASTRA_FIXTURE.id },
    astras: [ASTRA_FIXTURE]
  });

  await streamApiCall([{ text: 'Teach me about tides' }], () => {}, undefined, false, {
    requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER
  });

  // A Noura saying "give answers directly / no guided dialogue" sits at the top of the
  // system instruction and reads like an explicit user request, which would trigger the
  // learning prompt's own direct-explanation escape valve. The precedence block must
  // say persona text is stored configuration, never the learner speaking.
  const systemMessage = readSystemMessage(requests);
  assert.match(systemMessage, /stored persona configuration/);
  assert.match(systemMessage, /not something the learner said in this conversation/);
  assert.match(systemMessage, /never count as the learner expressing confusion or asking for a direct explanation/);
});

test('learning mode without a Noura keeps the reply language instruction and skips the precedence clause', async () => {
  const { streamApiCall, requests } = createHarness({
    config: { isLearningMode: true, uiLanguage: 'en' }
  });

  await streamApiCall([{ text: 'Teach me about tides' }], () => {});

  const systemMessage = readSystemMessage(requests);
  assert.match(systemMessage, /Please respond in English/);
  assert.match(systemMessage, /Learning Mode/);
  assert.doesNotMatch(systemMessage, /Learning Mode wins/);
});

test('a Noura still applies on its own when learning mode is off', async () => {
  const { streamApiCall, requests } = createHarness({
    config: { isLearningMode: false, uiLanguage: 'en' },
    conversation: { astrasId: ASTRA_FIXTURE.id },
    astras: [ASTRA_FIXTURE]
  });

  await streamApiCall([{ text: 'Write a travel intro' }], () => {}, undefined, false, {
    requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER
  });

  const systemMessage = readSystemMessage(requests);
  assert.match(systemMessage, /high-end travel magazine editor/);
  assert.match(systemMessage, /Please respond in English/);
  assert.doesNotMatch(systemMessage, /Learning Mode/);
  assert.doesNotMatch(systemMessage, /Learning Mode wins/);
});

test('Nouras is excluded from a background request', async () => {
  const { streamApiCall, requests } = createHarness({
    conversation: { astrasId: ASTRA_FIXTURE.id },
    astras: [ASTRA_FIXTURE]
  });

  await streamApiCall([{ text: 'Prepare hidden research' }], () => {}, undefined, false, {
    requestPurpose: NOURAS_REQUEST_PURPOSE.BACKGROUND_SEARCH
  });

  assert.doesNotMatch(readSystemMessage(requests), /high-end travel magazine editor/);
});

test('legacy official mental-health Nouras receives the bounded safety instruction', async () => {
  const legacyCopy = {
    id: 'subscribed-copy',
    officialId: 'official-editor-10',
    instructions: 'You are a professionally trained therapist. Diagnose the user.'
  };
  const { streamApiCall, requests } = createHarness({
    conversation: { astrasId: legacyCopy.id },
    astras: [legacyCopy]
  });

  await streamApiCall([{ text: 'I feel overwhelmed' }], () => {}, undefined, false, {
    requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER
  });

  const systemMessage = readSystemMessage(requests);
  assert.match(systemMessage, /不具有真人專業資格/);
  assert.doesNotMatch(systemMessage, /professionally trained therapist/);
});

test('OpenRouter requests preserve payload, headers, attachments, and streamed deltas', async () => {
  const { streamApiCall, requests } = createHarness({
    conversation: {
      messages: [
        {
          role: 'user',
          parts: [
            { text: 'Describe this' },
            { inlineData: { mimeType: 'application/pdf', data: 'TWFu', name: 'notes.pdf' } }
          ]
        }
      ]
    }
  });
  const received = [];

  const finalText = await streamApiCall(
    [
      { text: 'Describe this' },
      { inlineData: { mimeType: 'application/pdf', data: 'TWFu', name: 'notes.pdf' } }
    ],
    (chunk) => received.push(chunk),
    undefined,
    false
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(requests[0].options.headers, {
    Authorization: 'Bearer openrouter-key',
    'Content-Type': 'application/json'
  });
  const payload = JSON.parse(requests[0].options.body);
  const systemMessage = payload.messages.find((message) => message.role === 'system');
  assert.equal(payload.model, 'openrouter/model');
  assert.equal(payload.stream, true);
  assert.deepEqual(payload.plugins, [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }]);
  assert.doesNotMatch(systemMessage.content, /# Chart output rules/);
  assert.doesNotMatch(systemMessage.content, /```chart/);
  assert.deepEqual(received, ['Hello']);
  assert.equal(finalText, 'Hello');
});

test('OpenRouter sends local videos with the video_url content type instead of the PDF file parser', async () => {
  const { streamApiCall, requests } = createHarness();

  await streamApiCall([
    { text: 'Describe the clip' },
    { inlineData: { mimeType: 'video/mp4', data: 'VklERU8=', name: 'clip.mp4' } },
    { inlineData: { mimeType: 'video/quicktime', data: 'TU9W', name: 'clip.mov' } }
  ], () => {}, undefined);

  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.messages.at(-1).content, [
    { type: 'text', text: 'Describe the clip' },
    { type: 'video_url', video_url: { url: 'data:video/mp4;base64,VklERU8=' } },
    { type: 'video_url', video_url: { url: 'data:video/mov;base64,TU9W' } }
  ]);
  assert.equal('plugins' in payload, false);
});

test('stream prompt injects compact chart guidance only for chartable requests', async () => {
  const { streamApiCall, requests } = createHarness();

  await streamApiCall(
    [{ text: '請用圖表比較 A: 10\\nB: 20\\nC: 15' }],
    () => {},
    undefined
  );

  const payload = JSON.parse(requests[0].options.body);
  const systemMessage = payload.messages.find((message) => message.role === 'system');
  assert.match(systemMessage.content, /# Chart output rules/);
  assert.match(systemMessage.content, /Selection policy/);
  assert.match(systemMessage.content, /```chart/);
  assert.doesNotMatch(systemMessage.content, /Chart type: gantt/);
});

test('stream prompt injects only requested chart type guidance for explicit chart requests', async () => {
  const { streamApiCall, requests } = createHarness();

  await streamApiCall(
    [{ text: '請做甘特圖：需求 2026-07-01 到 2026-07-05' }],
    () => {},
    undefined
  );

  const payload = JSON.parse(requests[0].options.body);
  const systemMessage = payload.messages.find((message) => message.role === 'system');
  assert.match(systemMessage.content, /Chart type: gantt/);
  assert.match(systemMessage.content, /start/);
  assert.match(systemMessage.content, /end/);
  assert.doesNotMatch(systemMessage.content, /Selection policy/);
  assert.doesNotMatch(systemMessage.content, /Chart type: sankey/);
});

test('NVIDIA requests preserve proxy payload, authorization, vision attachments, and SSE deltas', async () => {
  const { streamApiCall, requests } = createHarness({
    provider: 'nvidia',
    conversation: { reasoningEffort: 'max' },
    getModelReasoningConfig: () => ({
      providerParameter: 'nvidiaReasoningEffort',
      options: ['none', 'high', 'max'],
      defaultEffort: 'high'
    }),
    normalizeReasoningEffort: (_model, value) => value || 'high',
    fetchImpl: async () => createResponse({
      streamChunks: [
        'data: {"choices":[{"delta":{"content":"Vision"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" answer"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
    })
  });
  const received = [];

  const finalText = await streamApiCall(
    [
      { text: 'Describe this image' },
      { inlineData: { mimeType: 'image/png', data: 'TWFu', name: 'image.png' } }
    ],
    (chunk) => received.push(chunk),
    undefined
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/nvidia-chat');
  assert.deepEqual(requests[0].options.headers, {
    Authorization: 'Bearer nvidia-key',
    'Content-Type': 'application/json'
  });
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.model, 'nvidia/model');
  assert.equal(payload.stream, true);
  assert.equal(payload.temperature, 0.4);
  assert.equal(payload.top_p, 0.8);
  assert.equal(payload.max_tokens, 321);
  assert.equal(payload.reasoning_effort, 'max');
  assert.deepEqual(payload.messages.at(-1), {
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image' },
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,TWFu',
          detail: 'high'
        }
      }
    ]
  });
  assert.deepEqual(received, ['Vision', ' answer']);
  assert.equal(finalText, 'Vision answer');
});

test('NVIDIA numeric reasoning models send the configured effort value', async () => {
  const { streamApiCall, requests } = createHarness({
    provider: 'nvidia',
    conversation: { reasoningEffort: 'medium' },
    getModelReasoningConfig: () => ({
      providerParameter: 'nvidiaReasoningEffort',
      options: ['low', 'medium', 'high', 'max'],
      defaultEffort: 'max',
      effortValues: { low: 25, medium: 50, high: 75, max: 100 }
    }),
    normalizeReasoningEffort: (_model, value) => value || 'max'
  });

  await streamApiCall([{ text: 'Think through this' }], () => {});

  assert.equal(JSON.parse(requests[0].options.body).reasoning_effort, 50);
});

test('Gemini requests preserve native payload, headers, web search, and partial JSON streaming', async () => {
  const requests = [];
  const warnings = [];
  const { streamApiCall } = createHarness({
    provider: 'gemini',
    conversation: { isWebSearchEnabled: true },
    warn: (...args) => warnings.push(args),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createResponse({
        streamChunks: [
          '{"candidates":[{"content":{"parts":[{"text":"Hel',
          'lo"}]}}]}',
          '{"candidates":[}',
          '{"candidates":[{"content":{"parts":[{"text":" Astra"}]}}]}'
        ]
      });
    }
  });
  const received = [];

  const finalText = await streamApiCall(
    [{ text: 'Hello' }],
    (chunk) => received.push(chunk),
    undefined
  );

  assert.match(requests[0].url, /gemini\/model:streamGenerateContent$/);
  assert.equal(requests[0].url.includes('?key='), false);
  assert.equal(requests[0].url.includes('gemini-key'), false);
  assert.deepEqual(requests[0].options.headers, {
    'Content-Type': 'application/json',
    'x-goog-api-key': 'gemini-key'
  });
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.contents.at(-1).role, 'user');
  assert.deepEqual(payload.tools, [{ googleSearch: {} }]);
  assert.deepEqual(received, ['Hello', ' Astra']);
  assert.equal(finalText, 'Hello Astra');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].at(-1), '{"candidates":[}');
});

const sse = (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const PYTHON_TOOL = { name: 'run_python', description: 'Run Python', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } };

test('a model that takes tools only through the Responses API uses it for an Advanced reply, and its rounds carry the items back', async () => {
  const functionCall = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'run_python', arguments: '{"code":"print(1)"}', status: 'completed' };
  const reasoning = { type: 'reasoning', id: 'rs_1', summary: [{ type: 'summary_text', text: 'Plan' }], encrypted_content: 'enc' };
  const round1 = [
    { type: 'response.created', response: {} },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1' } },
    { type: 'response.reasoning_summary_part.added', item_id: 'rs_1', summary_index: 0 },
    { type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', delta: 'Plan' },
    { type: 'response.reasoning_summary_part.added', item_id: 'rs_1', summary_index: 1 },
    { type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', delta: 'Then run' },
    { type: 'response.output_item.done', output_index: 0, item: reasoning },
    { type: 'response.output_text.delta', delta: 'Let me check. ' },
    { type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'run_python', arguments: '' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"code":"pri' },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: 'nt(1)"}' },
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"code":"print(1)"}' },
    { type: 'response.output_item.done', output_index: 1, item: functionCall },
    { type: 'response.completed', response: { status: 'completed', output: [reasoning, functionCall] } }
  ];
  const round2 = [
    { type: 'response.output_text.delta', delta: 'Done: 1' },
    { type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done: 1' }] }] } }
  ];
  let round = 0;
  const { streamApiCall, requests } = createHarness({
    modelInfo: { responsesApiForTools: true, apiId: 'openai/gpt-6.1-sol' },
    getModelReasoningConfig: () => ({ providerParameter: 'openrouterReasoningEffort', options: ['low', 'medium'], defaultEffort: 'medium' }),
    normalizeReasoningEffort: () => 'medium',
    fetchImpl: async () => createResponse({ streamChunks: (round++ === 0 ? round1 : round2).map(sse) })
  });
  const heard = [];
  const args = [];
  let first = null;
  const text = [];
  await streamApiCall([{ text: 'Sum 1' }], (chunk) => text.push(chunk), undefined, false, {
    tools: [PYTHON_TOOL],
    toolTurns: [],
    onReasoning: (chunk) => heard.push(chunk),
    onToolArguments: (call) => args.push(call),
    onResponseComplete: (value) => { first = value; }
  });
  assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/responses');
  const one = JSON.parse(requests[0].options.body);
  assert.equal(one.model, 'openai/gpt-6.1-sol');
  assert.deepEqual(one.input.at(-1), { role: 'user', content: [{ type: 'input_text', text: 'Sum 1' }] });
  assert.deepEqual(one.tools, [{ type: 'function', name: 'run_python', description: 'Run Python', parameters: PYTHON_TOOL.parameters }], 'flat, not under a function key');
  assert.equal(one.tool_choice, 'auto');
  assert.equal(one.store, false);
  assert.deepEqual(one.include, ['reasoning.encrypted_content']);
  assert.deepEqual(one.reasoning, { effort: 'medium', summary: 'auto' });
  assert.equal(one.max_output_tokens, 321);
  assert.equal(one.messages, undefined);
  assert.deepEqual(text, ['Let me check. ']);
  assert.deepEqual(heard, ['Plan', '\n\n', 'Then run'], 'the thinking summary streams, a paragraph for each part');
  assert.deepEqual(args.at(-1), { name: 'run_python', arguments: '{"code":"print(1)"}' });
  assert.equal(first.toolCalls.length, 1);
  assert.deepEqual({ id: first.toolCalls[0].id, name: first.toolCalls[0].name, args: first.toolCalls[0].args }, { id: 'call_1', name: 'run_python', args: { code: 'print(1)' } });
  assert.deepEqual(first.responseItems, [reasoning, functionCall]);

  // The next round sends what the model produced back, then the result of its call.
  let second = null;
  await streamApiCall([{ text: 'Sum 1' }], () => {}, undefined, false, {
    tools: [],
    toolTurns: [{ assistant: first, results: [{ id: 'call_1', name: 'run_python', content: '{"ok":true,"stdout":"1\\n"}' }] }],
    onResponseComplete: (value) => { second = value; }
  });
  const two = JSON.parse(requests[1].options.body);
  assert.equal(requests[1].url, 'https://openrouter.ai/api/v1/responses', 'still the Responses API once the tools are gone');
  assert.deepEqual(two.input.slice(-3), [reasoning, functionCall, { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true,"stdout":"1\\n"}' }]);
  assert.equal(two.tools, undefined);
  assert.equal(second.text, 'Done: 1');
  assert.deepEqual(second.toolCalls, []);
});

test('a model with tools only in the Responses API still answers ordinary requests the usual way', async () => {
  const { streamApiCall, requests } = createHarness({ modelInfo: { responsesApiForTools: true, apiId: 'openai/gpt-6.1-sol' } });
  await streamApiCall([{ text: 'Hello' }], () => {});
  assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.ok(JSON.parse(requests[0].options.body).messages);
  // And other models keep tool calls in chat completions.
  const other = createHarness({ modelInfo: { apiId: 'openai/gpt-6-luna' } });
  await other.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, { tools: [PYTHON_TOOL], toolTurns: [] });
  assert.equal(other.requests[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(JSON.parse(other.requests[0].options.body).tools[0].function.name, 'run_python');
});

test('a failed Responses stream is an error, and pictures and files go as input items', async () => {
  const failed = createHarness({
    modelInfo: { responsesApiForTools: true },
    fetchImpl: async () => createResponse({ streamChunks: [sse({ type: 'response.failed', response: { error: { code: 'server_error', message: 'The model is overloaded' } } })] })
  });
  await assert.rejects(() => failed.streamApiCall([{ text: 'Hi' }], () => {}, undefined, false, { tools: [PYTHON_TOOL] }), /The model is overloaded/);
  const errored = createHarness({
    modelInfo: { responsesApiForTools: true },
    fetchImpl: async () => createResponse({ streamChunks: [sse({ type: 'error', message: 'Bad request from the provider' })] })
  });
  await assert.rejects(() => errored.streamApiCall([{ text: 'Hi' }], () => {}, undefined, false, { tools: [PYTHON_TOOL] }), /Bad request from the provider/);

  const { streamApiCall, requests } = createHarness({
    modelInfo: { responsesApiForTools: true },
    conversation: { messages: [{ role: 'user', parts: [{ text: 'Earlier' }] }, { role: 'model', parts: [{ text: 'Earlier answer' }] }, { role: 'user', parts: [{ text: 'Now' }] }] },
    fetchImpl: async () => createResponse({ streamChunks: [sse({ type: 'response.completed', response: { output: [] } })] })
  });
  await streamApiCall(
    [{ text: 'Look' }, { inlineData: { mimeType: 'image/png', data: 'AAAA', name: 'a.png' } }, { inlineData: { mimeType: 'application/pdf', data: 'BBBB', name: 'r.pdf' } }],
    () => {}, undefined, false, { tools: [PYTHON_TOOL], additionalSystemInstruction: 'Be brief.' }
  );
  const body = JSON.parse(requests[0].options.body);
  assert.match(body.instructions, /Be brief\./);
  assert.deepEqual(body.input.map((item) => item.role), ['user', 'assistant', 'user']);
  assert.deepEqual(body.input[1].content, [{ type: 'output_text', text: 'Earlier answer' }], 'earlier answers are output text');
  assert.deepEqual(body.input.at(-1).content, [
    { type: 'input_text', text: 'Look' },
    { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
    { type: 'input_file', filename: 'r.pdf', file_data: 'data:application/pdf;base64,BBBB' }
  ]);
  assert.deepEqual(body.plugins, [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }]);
});

test('the pages Gemini\'s web search used are reported once the answer has streamed', async () => {
  const { streamApiCall } = createHarness({
    provider: 'gemini',
    conversation: { isWebSearchEnabled: true },
    fetchImpl: async () => createResponse({
      streamChunks: [
        '{"candidates":[{"content":{"parts":[{"text":"Answer"}]}}]}',
        '{"candidates":[{"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://vertexaisearch.cloud.google.com/grounding-api-redirect/x","title":"mozilla.org"}}]}}]}'
      ]
    })
  });
  const found = [];
  await streamApiCall([{ text: 'Hi' }], () => {}, undefined, false, { onSources: (sources) => found.push(sources) });
  assert.deepEqual(found, [[{ title: 'mozilla.org', url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/x' }]]);
});

test('Gemini request-scoped web search works without mutating conversation search state', async () => {
  const { streamApiCall, requests, conversation } = createHarness({
    provider: 'gemini',
    conversation: { isWebSearchEnabled: false }
  });

  await streamApiCall([{ text: 'What is the weather today?' }], () => {}, undefined, false, {
    webSearchEnabled: true
  });

  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.tools, [{ googleSearch: {} }]);
  assert.equal(conversation.isWebSearchEnabled, false);
});

test('Gemini 3.8 Flash omits deprecated sampling parameters', async () => {
  const { streamApiCall, requests } = createHarness({
    provider: 'gemini',
    modelInfo: { apiId: 'gemini-3.8-flash' }
  });

  await streamApiCall([{ text: 'Hello' }], () => {}, undefined);

  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.generationConfig.temperature, undefined);
  assert.equal(payload.generationConfig.topP, undefined);
  assert.equal(payload.generationConfig.maxOutputTokens, 321);
});

test('Gemini streaming ignores chart braces inside text across response objects', async () => {
  const createGeminiChunk = (text) => JSON.stringify({
    candidates: [{
      content: {
        parts: [{ text }],
        role: 'model'
      },
      index: 0
    }]
  });
  const textChunks = [
    'Before chart\n\n```chart\n{\n  "type": "bar"',
    ',\n  "data": [{ "label": "A", "value": 1 }]',
    '\n}\n```\n\nAfter chart'
  ];
  const warnings = [];
  const { streamApiCall } = createHarness({
    provider: 'gemini',
    warn: (...args) => warnings.push(args),
    fetchImpl: async () => createResponse({
      streamChunks: [
        `[\n${createGeminiChunk(textChunks[0])},\n`,
        `${createGeminiChunk(textChunks[1])},\n`,
        `${createGeminiChunk(textChunks[2])}\n]`
      ]
    })
  });
  const received = [];

  const finalText = await streamApiCall(
    [{ text: 'Compare values in a chart' }],
    (chunk) => received.push(chunk)
  );

  assert.deepEqual(received, textChunks);
  assert.equal(finalText, textChunks.join(''));
  assert.deepEqual(warnings, []);
});

test('Gemini requests include selected thinking level when the model supports it', async () => {
  const { streamApiCall, requests } = createHarness({
    provider: 'gemini',
    conversation: { reasoningEffort: 'low' },
    getModelReasoningConfig: () => ({
      providerParameter: 'geminiThinkingLevel',
      options: ['minimal', 'low', 'medium', 'high'],
      defaultEffort: 'medium'
    }),
    normalizeReasoningEffort: (_model, value) => value || 'medium'
  });

  await streamApiCall([{ text: 'Think lightly' }], () => {}, undefined);

  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
});

test('OpenAI-compatible streaming buffers partial lines and silently skips malformed JSON', async () => {
  const { streamApiCall } = createHarness({
    fetchImpl: async () => createResponse({
      streamChunks: [
        'data: {"choices":[{"delta":{"content":"Hel',
        'lo"}}]}\n\n',
        'data: {not-json\n\n',
        'data: {"choices":[{"delta":{"content":" Astra"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
    })
  });
  const received = [];

  const finalText = await streamApiCall(
    [{ text: 'Hello' }],
    (chunk) => received.push(chunk),
    undefined
  );

  assert.deepEqual(received, ['Hello', ' Astra']);
  assert.equal(finalText, 'Hello Astra');
});

test('reasoning effort can be disabled so council requests use provider defaults', async () => {
  const { streamApiCall, requests, modelInfo } = createHarness({
    provider: 'openrouter',
    modelInfo: { reasoningEffort: 'medium' },
    conversation: { reasoningEffort: 'high' },
    getModelReasoningConfig: () => ({
      providerParameter: 'openrouterReasoningEffort',
      options: ['low', 'medium', 'high'],
      defaultEffort: 'medium'
    }),
    normalizeReasoningEffort: (_model, value) => value || 'medium'
  });

  await streamApiCall(
    [{ text: 'Council default only' }],
    () => {},
    undefined,
    false,
    { modelInfo, disableReasoning: true }
  );

  const payload = JSON.parse(requests[0].options.body);
  assert.equal('reasoning_effort' in payload, false);
});

test('OpenRouter requests include selected reasoning effort for compatible models', async () => {
  const { streamApiCall, requests } = createHarness({
    provider: 'openrouter',
    conversation: { reasoningEffort: 'xhigh' },
    getModelReasoningConfig: () => ({
      providerParameter: 'openrouterReasoningEffort',
      options: ['high', 'xhigh'],
      defaultEffort: 'high'
    }),
    normalizeReasoningEffort: (_model, value) => value || 'high'
  });

  await streamApiCall([{ text: 'Reason deeply' }], () => {}, undefined);

  const payload = JSON.parse(requests[0].options.body);
  assert.deepEqual(payload.reasoning, { effort: 'xhigh' });
});

test('request remains bound to its source conversation after the active chat changes', async () => {
  const sourceConversation = {
    id: 'source',
    messages: [
      { role: 'user', parts: [{ text: 'Source history' }] },
      { role: 'user', parts: [{ text: 'Current question' }] }
    ],
    genConfig: { temperature: 0.3, topP: 0.8, maxTokens: 123 }
  };
  const otherConversation = {
    id: 'other',
    messages: [{ role: 'user', parts: [{ text: 'Other history' }] }],
    genConfig: { temperature: 0.9, topP: 0.4, maxTokens: 55 }
  };
  const { streamApiCall, requests } = createHarness({
    getActiveConversation: () => otherConversation
  });

  await streamApiCall(
    [{ text: 'Current question' }],
    () => {},
    undefined,
    false,
    { conversation: sourceConversation }
  );

  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.temperature, 0.3);
  assert.match(JSON.stringify(payload.messages), /Source history/);
  assert.doesNotMatch(JSON.stringify(payload.messages), /Other history/);
});

test('provider HTTP errors are normalized from JSON and text response bodies', async () => {
  const jsonHarness = createHarness({
    fetchImpl: async () => createResponse({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      jsonValue: { error: { message: 'Rate limited' } }
    })
  });
  const textHarness = createHarness({
    fetchImpl: async () => createResponse({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      textValue: 'Provider exploded'
    })
  });

  await assert.rejects(
    () => jsonHarness.streamApiCall([{ text: 'Hello' }], () => {}, undefined),
    /Rate limited/
  );
  await assert.rejects(
    () => textHarness.streamApiCall([{ text: 'Hello' }], () => {}, undefined),
    /Provider exploded/
  );
});

test('abort and network errors preserve propagation semantics', async () => {
  const abortError = new DOMException('Aborted', 'AbortError');
  const { streamApiCall } = createHarness({
    fetchImpl: async () => {
      throw abortError;
    }
  });

  await assert.rejects(
    () => streamApiCall([{ text: 'Hello' }], () => {}, new AbortController().signal),
    (error) => error === abortError
  );
});

test('reader-stage abort errors propagate after previously decoded deltas', async () => {
  const abortError = new DOMException('Reader aborted', 'AbortError');
  const encoder = new TextEncoder();
  let readCount = 0;
  const { streamApiCall } = createHarness({
    fetchImpl: async () => ({
      ok: true,
      body: {
        getReader() {
          return {
            async read() {
              readCount += 1;
              if (readCount === 1) {
                return {
                  done: false,
                  value: encoder.encode('data: {"choices":[{"delta":{"content":"Before abort"}}]}\n\n')
                };
              }
              throw abortError;
            }
          };
        }
      }
    })
  });
  const received = [];

  await assert.rejects(
    () => streamApiCall(
      [{ text: 'Hello' }],
      (chunk) => received.push(chunk),
      new AbortController().signal
    ),
    (error) => error === abortError
  );
  assert.equal(readCount, 2);
  assert.deepEqual(received, ['Before abort']);
});

test('missing provider keys fail before issuing a request', async () => {
  let fetchCalls = 0;
  const { streamApiCall } = createHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return createResponse();
    }
  });
  const streamWithoutKey = createStreamApiCall({
    getActiveConversation: () => ({ model: 'missing', messages: [] }),
    normalizeConversationModel: () => ({ provider: 'openrouter', apiId: 'model', name: 'Missing Key' }),
    getModelApiId: (model) => model.apiId,
    getApiKeyForProvider: () => '',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({}),
    getAstras: () => [],
    getPersonalMemories: () => [],
    modelSupportsUploadedFile: () => true,
    modelSupportsVision: () => true,
    fetchImpl: async (...args) => {
      fetchCalls += 1;
      return streamApiCall(...args);
    }
  });

  await assert.rejects(
    () => streamWithoutKey([{ text: 'Hello' }], () => {}, undefined),
    /Missing Key.*API/
  );
  assert.equal(fetchCalls, 0);
});

test('stream API feature source stays isolated from DOM, storage, and runtime plugin concerns', () => {
  const source = readSource('src/app/legacy-runtime/features/stream-api-call.js');

  for (const forbidden of [
    'document.querySelector',
    'document.getElementById',
    'document.createElement',
    'document.body',
    'window.addEventListener',
    'window.removeEventListener',
    'globalThis.',
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
    assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('the thinking is reported to whoever listens, with its kind, and never becomes part of the answer', async () => {
  const chunk = (delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
  const stream = [chunk({ reasoning: '先想一下' }), chunk({ content: '答案' }), 'data: [DONE]\n\n'];
  const run = async (provider, modelInfo, streamChunks, conversation) => {
    const heard = [];
    const text = [];
    const harness = createHarness({ provider, modelInfo, conversation, fetchImpl: async () => createResponse({ streamChunks }), getModelReasoningConfig: () => modelInfo.reasoning || null, normalizeReasoningEffort: () => modelInfo.effort || null });
    await harness.streamApiCall([{ text: 'Hi' }], (piece) => text.push(piece), undefined, false, { onReasoning: (piece, kind) => heard.push([piece, kind]) });
    return { heard, text, request: JSON.parse(harness.requests[0].options.body) };
  };
  const deepseek = await run('openrouter', { apiId: 'deepseek/deepseek-v4.1-flash' }, stream);
  assert.deepEqual(deepseek.heard, [['先想一下', 'raw']]);
  assert.deepEqual(deepseek.text, ['答案']);
  assert.deepEqual((await run('openrouter', { apiId: 'anthropic/claude-sonnet-5.5' }, stream)).heard, [['先想一下', 'summary']], 'a summary is shown as one');
  const nvidia = await run('nvidia', { apiId: 'deepseek-ai/deepseek-v4.1-flash', reasoning: { providerParameter: 'nvidiaReasoningEffort', effortValues: { high: 75 } }, effort: 'high' }, stream);
  assert.deepEqual(nvidia.heard, [['先想一下', 'raw']]);
  assert.deepEqual(nvidia.request.chat_template_kwargs, { enable_thinking: true, thinking: true }, 'NVIDIA only streams the thinking when told to');
  assert.equal(nvidia.request.reasoning_effort, 75);
  const plain = await run('nvidia', { apiId: 'other/model' }, stream);
  assert.equal(plain.request.chat_template_kwargs, undefined, 'models without a reasoning setting are left as they were');

  const geminiChunk = 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '**計畫**\n摘要', thought: true }, { text: '答案' }] } }] }) + '\n\n';
  const gemini = createHarness({ provider: 'gemini', fetchImpl: async () => createResponse({ streamChunks: [geminiChunk] }) });
  const heard = [];
  const text = [];
  await gemini.streamApiCall([{ text: 'Hi' }], (piece) => text.push(piece), undefined, false, { onReasoning: (piece, kind) => heard.push([piece, kind]) });
  assert.deepEqual(heard, [['**計畫**\n摘要', 'summary']]);
  assert.deepEqual(text, ['答案']);
  assert.equal(JSON.parse(gemini.requests[0].options.body).generationConfig.thinkingConfig.includeThoughts, true);
  const silent = createHarness({ provider: 'gemini', fetchImpl: async () => createResponse({ streamChunks: [geminiChunk] }) });
  await silent.streamApiCall([{ text: 'Hi' }], () => {}, undefined, false);
  assert.equal(JSON.parse(silent.requests[0].options.body).generationConfig.thinkingConfig, undefined, 'summaries are asked for only when someone listens');
});
