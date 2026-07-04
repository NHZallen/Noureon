import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  finalizeAssistantResponse,
  persistAssistantResponseError
} from '../src/app/legacy-runtime/features/assistant-response-finalization.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('successful finalization persists final assistant text, view completion, and memory in order', async () => {
  const calls = [];
  const conversation = { messages: [], lastUpdatedAt: 'old' };
  const finalAiMessage = { role: 'model', parts: [{ text: '' }], createdAt: 'created' };
  const signal = new AbortController().signal;

  await finalizeAssistantResponse({
    fullResponse: 'Hello Astra',
    finalAiMessage,
    conversation,
    userMessageObject: { role: 'user', parts: [{ text: 'Hi' }] },
    userMessageText: 'Hi',
    signal,
    responseUsesCouncil: false,
    responseRenderedInRealtime: true,
    targetElement: { dataset: { streamRendered: 'true' } },
    uiLanguage: 'en',
    memoryEnabled: true,
    autoMemoryEnabled: true,
    councilMetadata: null,
    persistAppData: async () => calls.push(['persist']),
    completeSingleModelView: async ({ fullResponse, responseRenderedInRealtime }) => calls.push(['singleView', fullResponse, responseRenderedInRealtime]),
    restoreRealtimeCouncilDetails: () => calls.push(['restoreCouncil']),
    renderRealtimeCouncilFinal: () => calls.push(['renderCouncilFinal']),
    playbackCouncilResponse: async () => calls.push(['playbackCouncil']),
    extractPersonalMemory: async (message, response) => calls.push(['memory', message, response]),
    nowIso: () => 'now'
  });

  assert.deepEqual(finalAiMessage.parts, [{ text: 'Hello Astra' }]);
  assert.equal(conversation.messages[0], finalAiMessage);
  assert.equal(conversation.lastUpdatedAt, 'now');
  assert.deepEqual(calls, [
    ['persist'],
    ['singleView', 'Hello Astra', true],
    ['memory', 'Hi', 'Hello Astra']
  ]);
});

test('council finalization attaches metadata and preserves realtime/buffered view handoffs', async () => {
  const realtimeCalls = [];
  const realtimeElement = { dataset: { streamRendered: 'true' } };
  await finalizeAssistantResponse({
    fullResponse: 'Council answer',
    finalAiMessage: { role: 'model', parts: [{ text: '' }], createdAt: 'created' },
    conversation: { messages: [] },
    userMessageObject: {},
    userMessageText: 'Question',
    signal: new AbortController().signal,
    responseUsesCouncil: true,
    responseRenderedInRealtime: true,
    targetElement: realtimeElement,
    uiLanguage: 'en',
    councilMetadata: { models: ['a', 'b'] },
    includeCouncilMetadata: true,
    persistAppData: async () => realtimeCalls.push('persist'),
    completeSingleModelView: async () => realtimeCalls.push('singleView'),
    restoreRealtimeCouncilDetails: ({ targetElement }) => realtimeCalls.push(['restore', targetElement === realtimeElement]),
    renderRealtimeCouncilFinal: () => realtimeCalls.push('renderFinal'),
    playbackCouncilResponse: async () => realtimeCalls.push('playback'),
    extractPersonalMemory: async () => realtimeCalls.push('memory'),
    nowIso: () => 'now'
  });
  assert.deepEqual(realtimeCalls, ['persist', ['restore', true]]);

  const bufferedCalls = [];
  const message = { role: 'model', parts: [{ text: '' }], createdAt: 'created' };
  await finalizeAssistantResponse({
    fullResponse: 'Council answer',
    finalAiMessage: message,
    conversation: { messages: [] },
    userMessageObject: {},
    userMessageText: 'Question',
    signal: new AbortController().signal,
    responseUsesCouncil: true,
    responseRenderedInRealtime: false,
    targetElement: { dataset: {} },
    uiLanguage: 'en',
    councilMetadata: { models: ['x'] },
    includeCouncilMetadata: true,
    persistAppData: async () => bufferedCalls.push('persist'),
    completeSingleModelView: async () => bufferedCalls.push('singleView'),
    restoreRealtimeCouncilDetails: () => bufferedCalls.push('restore'),
    renderRealtimeCouncilFinal: () => bufferedCalls.push('renderFinal'),
    playbackCouncilResponse: async () => bufferedCalls.push('playback'),
    extractPersonalMemory: async () => bufferedCalls.push('memory'),
    nowIso: () => 'now'
  });

  assert.deepEqual(message.council, { models: ['x'] });
  assert.deepEqual(bufferedCalls, ['persist', 'playback']);
});

test('finalization rejects empty responses before persistence or side effects', async () => {
  const calls = [];

  await assert.rejects(
    () => finalizeAssistantResponse({
      fullResponse: '   ',
      finalAiMessage: { role: 'model', parts: [{ text: '' }], createdAt: 'created' },
      conversation: { messages: [] },
      userMessageObject: {},
      userMessageText: 'Question',
      signal: new AbortController().signal,
      responseUsesCouncil: false,
      responseRenderedInRealtime: false,
      targetElement: { dataset: {} },
      uiLanguage: 'en',
      persistAppData: async () => calls.push('persist'),
      completeSingleModelView: async () => calls.push('singleView'),
      restoreRealtimeCouncilDetails: () => calls.push('restore'),
      renderRealtimeCouncilFinal: () => calls.push('renderFinal'),
      playbackCouncilResponse: async () => calls.push('playback'),
      extractPersonalMemory: async () => calls.push('memory')
    }),
    /without any response text/
  );

  assert.deepEqual(calls, []);
});

test('image finalization persists asset parts without mail or learning-memory side effects', async () => {
  const calls = [];
  const finalAiMessage = { role: 'model', parts: [], createdAt: 'created' };
  const finalParts = [{ generatedImage: { id: 'asset-1', storageKey: 'key', mediaType: 'image/png' } }];
  await finalizeAssistantResponse({
    fullResponse: '',
    finalParts,
    finalAiMessage,
    conversation: { messages: [] },
    userMessageObject: {},
    userMessageText: 'draw it',
    signal: new AbortController().signal,
    responseUsesCouncil: false,
    responseRenderedInRealtime: false,
    targetElement: { dataset: {} },
    uiLanguage: 'en',
    memoryEnabled: true,
    autoMemoryEnabled: true,
    persistAppData: async () => calls.push('persist'),
    completeSingleModelView: async () => calls.push('singleView'),
    completeImageView: async () => calls.push('imageView'),
    extractPersonalMemory: async () => calls.push('memory'),
    nowIso: () => 'now'
  });
  assert.deepEqual(finalAiMessage.parts, finalParts);
  assert.deepEqual(calls, ['persist', 'imageView']);
});

test('error finalization persists non-abort errors and skips aborted requests', async () => {
  const calls = [];
  const conversation = { model: 'fallback', messages: [] };
  const targetElement = { innerHTML: '' };
  const signal = new AbortController().signal;

  const result = await persistAssistantResponseError({
    error: new Error('broken'),
    signal,
    conversation,
    targetElement,
    errorPrefix: 'Sorry: ',
    fallbackModelName: 'Fallback Model',
    getLatestProgress: () => ({ modelName: 'Latest Model', elapsedMs: 5 }),
    stopSingleModelLifecycle: () => calls.push('stop'),
    renderError: (progress, message) => {
      calls.push(['render', progress.modelName, message]);
      return `error:${message}`;
    },
    persistAppData: async () => calls.push('persist'),
    nowIso: () => 'error-time'
  });

  assert.equal(result.persisted, true);
  assert.equal(targetElement.innerHTML, 'error:Sorry: broken');
  assert.deepEqual(conversation.messages, [
    { role: 'model', parts: [{ text: 'Sorry: broken' }], createdAt: 'error-time' }
  ]);
  assert.deepEqual(calls, ['stop', ['render', 'Latest Model', 'Sorry: broken'], 'persist']);

  const abortController = new AbortController();
  abortController.abort();
  const abortResult = await persistAssistantResponseError({
    error: new DOMException('Aborted', 'AbortError'),
    signal: abortController.signal,
    conversation,
    targetElement,
    errorPrefix: 'Sorry: ',
    fallbackModelName: 'Fallback Model',
    getLatestProgress: () => null,
    stopSingleModelLifecycle: () => calls.push('abort-stop'),
    renderError: () => 'should-not-render',
    persistAppData: async () => calls.push('abort-persist')
  });

  assert.equal(abortResult.persisted, false);
  assert.equal(calls.includes('abort-stop'), false);
  assert.equal(calls.includes('abort-persist'), false);
});

test('error finalization preserves the legacy missing-prefix fallback text', async () => {
  const calls = [];
  const conversation = { messages: [] };
  const targetElement = { innerHTML: '' };

  const result = await persistAssistantResponseError({
    error: new Error('broken'),
    signal: new AbortController().signal,
    conversation,
    targetElement,
    fallbackModelName: 'Fallback Model',
    getLatestProgress: () => null,
    stopSingleModelLifecycle: () => calls.push('stop'),
    renderError: (progress, message) => {
      calls.push(['render', progress.modelName, message]);
      return `error:${message}`;
    },
    persistAppData: async () => calls.push('persist'),
    nowIso: () => 'error-time'
  });

  assert.equal(result.errorMessage, '抱歉，發生錯誤：broken');
  assert.equal(targetElement.innerHTML, 'error:抱歉，發生錯誤：broken');
  assert.deepEqual(conversation.messages, [
    { role: 'model', parts: [{ text: '抱歉，發生錯誤：broken' }], createdAt: 'error-time' }
  ]);
  assert.deepEqual(calls, ['stop', ['render', 'Fallback Model', '抱歉，發生錯誤：broken'], 'persist']);
  assert.doesNotMatch(result.errorMessage, /\?/);
});

test('assistant response finalization source avoids provider parser, storage schema, package, and Vite coupling', () => {
  const source = readSource('src/app/legacy-runtime/features/assistant-response-finalization.js');

  for (const forbidden of [
    'fetch',
    'TextDecoder',
    'response.body',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'streamApiCall',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
  assert.doesNotMatch(source, /sendConversationToMail|conversation-mail|google-form-submit/);
});
