import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createStreamApiCall } from '../src/app/legacy-runtime/features/stream-api-call.js';

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
  warn = () => {},
  fetchImpl
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
    getActiveConversation: () => resolvedConversation,
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
    modelSupportsUploadedFile: () => true,
    modelSupportsVision: () => true,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return runtimeFetch(url, options);
    },
    warn
  });

  return { streamApiCall, requests, modelInfo: resolvedModel, conversation: resolvedConversation };
};

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
  assert.equal(payload.model, 'openrouter/model');
  assert.equal(payload.stream, true);
  assert.deepEqual(payload.plugins, [{ id: 'file-parser', pdf: { engine: 'mistral-ocr' } }]);
  assert.deepEqual(received, ['Hello']);
  assert.equal(finalText, 'Hello');
});

test('NVIDIA requests preserve proxy payload, authorization, vision attachments, and SSE deltas', async () => {
  const { streamApiCall, requests } = createHarness({
    provider: 'nvidia',
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

  assert.match(requests[0].url, /gemini\/model:streamGenerateContent\?key=gemini-key$/);
  assert.deepEqual(requests[0].options.headers, { 'Content-Type': 'application/json' });
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.contents.at(-1).role, 'user');
  assert.deepEqual(payload.tools, [{ googleSearch: {} }]);
  assert.deepEqual(received, ['Hello', ' Astra']);
  assert.equal(finalText, 'Hello Astra');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].at(-1), '{"candidates":[}');
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

test('StepFun normal requests preserve proxy streaming, reasoning effort, and delta order', async () => {
  const { streamApiCall, requests } = createHarness({
    provider: 'stepfun',
    modelInfo: { reasoningEffort: 'medium' },
    fetchImpl: async () => createResponse({
      streamChunks: [
        'data: {"choices":[{"delta":{"content":"Step"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" Plan"}}]}\n\n',
        'data: [DONE]\n\n'
      ]
    })
  });
  const received = [];

  const finalText = await streamApiCall(
    [{ text: 'Create a plan' }],
    (chunk) => received.push(chunk),
    undefined
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/step-plan-chat');
  assert.deepEqual(requests[0].options.headers, {
    Authorization: 'Bearer stepfun-key',
    'Content-Type': 'application/json'
  });
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.model, 'stepfun/model');
  assert.equal(payload.stream, true);
  assert.equal(payload.reasoning_effort, 'medium');
  assert.equal(payload.messages.at(-1).role, 'user');
  assert.equal(payload.messages.at(-1).content, 'Create a plan');
  assert.deepEqual(received, ['Step', ' Plan']);
  assert.equal(finalText, 'Step Plan');
});

test('StepFun direct video requests preserve non-stream response handling', async () => {
  const requests = [];
  const { streamApiCall, modelInfo } = createHarness({
    provider: 'stepfun',
    modelInfo: { reasoningEffort: 'high' },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return createResponse({
        jsonValue: {
          choices: [{
            message: {
              content: [{ text: 'Video' }, { text: ' answer' }]
            }
          }]
        }
      });
    }
  });
  const received = [];

  const finalText = await streamApiCall(
    [{ inlineData: { mimeType: 'video/mp4', data: 'TWFu', name: 'clip.mp4' } }],
    (chunk) => received.push(chunk),
    undefined,
    false,
    {
      modelInfo,
      historyForApi: [],
      currentMessageForApi: {
        role: 'user',
        parts: [{ inlineData: { mimeType: 'video/mp4', data: 'TWFu', name: 'clip.mp4' } }]
      }
    }
  );

  assert.equal(requests[0].url, 'https://api.stepfun.com/v1/chat/completions');
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.stream, false);
  assert.equal(payload.reasoning_effort, 'high');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
  assert.deepEqual(received, ['Video answer']);
  assert.equal(finalText, 'Video answer');
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
