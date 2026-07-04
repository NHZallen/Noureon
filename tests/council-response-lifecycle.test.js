import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCouncilResponseLifecycle } from '../src/app/legacy-runtime/features/council-response-lifecycle.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const models = [
  { id: 'alpha', name: 'Alpha', provider: 'openrouter' },
  { id: 'beta', name: 'Beta', provider: 'openrouter' },
  { id: 'synth', name: 'Synth', provider: 'openrouter' }
];

const createHarness = ({
  mode = 'consensus',
  showRawResponses = false,
  showComparisonTable = false,
  webSearchEnabled = false,
  attachmentNeed = { needsAnyPacket: false },
  fetchTavilySearchPacket,
  filterPartsForModelCapability,
  getCouncilSharedSearchModel,
  getCouncilTranslatorModel,
  modelSupportsDocumentUpload = () => true,
  modelUsesNativeWebSearch = () => false,
  streamImpl,
  modelSupportsVision = () => true
} = {}) => {
  const calls = [];
  const tavilyCalls = [];
  const progressEvents = [];
  const finalChunks = [];
  const callCounts = new Map();
  const conversation = {
    isWebSearchEnabled: webSearchEnabled,
    messages: [
      { role: 'user', parts: [{ text: 'Earlier user' }] },
      { role: 'model', parts: [{ text: 'Earlier answer' }] },
      { role: 'user', parts: [{ text: 'Current question' }] }
    ]
  };
  const runtimeTexts = {
    completed: 'completed',
    deliberation: 'deliberation',
    done: 'done',
    failed: 'failed',
    firstRound: 'first round',
    noVisionParticipants: 'no active participants',
    retrying: 'retrying',
    running: 'running',
    searchDone: 'search done',
    searchFailed: 'search failed',
    searchRunning: 'search running',
    skippedVisualReason: 'skipped visual',
    synthesis: 'synthesis'
  };
  const texts = {
    comparisonTableTitle: 'Comparison',
    consensusMode: 'Consensus',
    deliberationMode: 'Deliberation',
    rawNotes: 'Raw notes',
    synthesizer: 'Synthesizer',
    title: 'Council'
  };
  const defaultStream = async (parts, onChunk, signal, isWebSearchForced, options = {}) => {
    assert.equal(isWebSearchForced, false);
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const id = options.modelInfo.id;
    const nextCount = (callCounts.get(id) || 0) + 1;
    callCounts.set(id, nextCount);
    calls.push({ id, parts, options });
    onChunk?.(`${id}:${nextCount}:chunk`);
    if (id === 'synth') return 'Synth final';
    return `${options.modelInfo.name} round ${nextCount}`;
  };

  const lifecycle = createCouncilResponseLifecycle({
    buildTavilySearchQuery: (value) => String(value || '').trim().slice(0, 120),
    getSearchCurrentDate: () => '2026-06-24',
    getConfig: () => ({ uiLanguage: 'en' }),
    getActiveConversation: () => conversation,
    getCouncilSelectedModels: () => ({
      council: { mode, showRawResponses, showComparisonTable },
      participants: [models[0], models[1]],
      synthesizer: models[2]
    }),
    getCouncilTexts: () => texts,
    getCouncilRuntimeTexts: () => runtimeTexts,
    getCouncilAttachmentTranslationNeed: () => attachmentNeed,
    getCouncilTranslatorModel: getCouncilTranslatorModel || (() => null),
    getCouncilSharedSearchModel: getCouncilSharedSearchModel || ((synthesizer) => synthesizer),
    models,
    councilMaxModels: 4,
    extractTextFromParts: (parts = []) => parts.map((part) => part.text || '').filter(Boolean).join('\n'),
    truncateCouncilText: (value = '', limit = 10000) => {
      const text = String(value || '').trim();
      return text.length > limit ? `${text.slice(0, limit)}\n\n[truncated]` : text;
    },
    filterPartsForModelCapability: filterPartsForModelCapability || ((parts = []) => parts),
    getSearchQueryFromParts: (parts = []) => parts.map((part) => part.text || '').join(' '),
    fetchTavilySearchPacket: fetchTavilySearchPacket || (async (...args) => {
      tavilyCalls.push(args);
      return `search packet ${tavilyCalls.length}`;
    }),
    streamCouncilApiCallWithRetry: streamImpl || defaultStream,
    modelUsesNativeWebSearch,
    modelSupportsVision,
    modelSupportsDocumentUpload
  });

  return {
    calls,
    finalChunks,
    lifecycle,
    progressEvents,
    tavilyCalls,
    run: (parts = [{ text: 'Question' }], signal = new AbortController().signal) =>
      lifecycle.runModelCouncil(
        parts,
        signal,
        (progress) => progressEvents.push(progress),
        (chunk) => finalChunks.push(chunk)
      )
  };
};

test('council lifecycle aggregates multiple model results in order and synthesizes final text', async () => {
  const { calls, finalChunks, progressEvents, run } = createHarness();

  const result = await run();

  assert.equal(result.text, 'Synth final');
  assert.deepEqual(result.metadata.participantModelIds, ['alpha', 'beta']);
  assert.deepEqual(result.metadata.activeParticipantModelIds, ['alpha', 'beta']);
  assert.deepEqual(result.metadata.firstRoundResults.map((item) => item.modelId), ['alpha', 'beta']);
  assert.deepEqual(result.metadata.finalRoundResults.map((item) => item.finalText), [
    'Alpha round 1',
    'Beta round 1'
  ]);
  assert.deepEqual(result.metadata.failures, []);
  assert.deepEqual(calls.map((call) => call.id), ['alpha', 'beta', 'synth']);
  assert.equal(calls.every((call) => call.options.disableReasoning === true), true);
  assert.deepEqual(finalChunks, ['synth:1:chunk']);
  assert.ok(progressEvents.some((event) => event.stage === 'firstRound'));
  assert.ok(progressEvents.some((event) => event.stage === 'synthesis'));
  assert.ok(progressEvents.some((event) => event.stage === 'completed'));
});

test('council lifecycle preserves participant failure boundary and still synthesizes usable results', async () => {
  const { calls, run } = createHarness({
    streamImpl: async (parts, onChunk, signal, isWebSearchForced, options = {}) => {
      calls.push({ id: options.modelInfo.id, parts, options });
      if (options.modelInfo.id === 'beta') {
        throw new Error('beta failed');
      }
      onChunk?.(`${options.modelInfo.id}:chunk`);
      return options.modelInfo.id === 'synth' ? 'Synth final' : 'Alpha answer';
    }
  });

  const result = await run();

  assert.equal(result.text, 'Synth final');
  assert.deepEqual(result.metadata.firstRoundResults.map((item) => item.modelId), ['alpha']);
  assert.deepEqual(result.metadata.failures.map((item) => [item.modelId, item.error]), [
    ['beta', 'beta failed']
  ]);
  assert.deepEqual(calls.map((call) => call.id), ['alpha', 'beta', 'synth']);
});

test('deliberation mode runs a second round before synthesis', async () => {
  const { calls, progressEvents, run } = createHarness({ mode: 'deliberation' });

  const result = await run();

  assert.equal(result.metadata.mode, 'deliberation');
  assert.deepEqual(calls.map((call) => call.id), ['alpha', 'beta', 'alpha', 'beta', 'synth']);
  assert.equal(calls.every((call) => call.options.disableReasoning === true), true);
  assert.deepEqual(result.metadata.finalRoundResults.map((item) => item.roundTwo), [
    'Alpha round 2',
    'Beta round 2'
  ]);
  assert.ok(progressEvents.some((event) => event.stage === 'deliberation'));
});

test('web search branch uses native model search for the shared packet', async () => {
  const { calls, progressEvents, run } = createHarness({
    webSearchEnabled: true,
    modelUsesNativeWebSearch: (model) => model?.id === 'synth'
  });

  const result = await run([{ text: 'Need current facts' }]);

  assert.equal(result.metadata.sharedSearchPacket, 'Synth final');
  assert.equal(result.metadata.secondSearchPacket, null);
  assert.deepEqual(calls.map((call) => call.id), ['synth', 'alpha', 'beta', 'synth']);
  assert.equal(calls[0].options.forceWebSearch, true);
  assert.equal(calls[0].options.ignoreConversationWebSearch, true);
  assert.equal(calls[0].options.disableReasoning, true);
  assert.deepEqual(calls[0].options.historyForApi, []);
  assert.match(calls[0].parts[0].text, /shared web research packet/i);
  assert.ok(progressEvents.some((event) => event.stage === 'search' && event.search?.status === 'done'));
});

test('web search branch uses Tavily fallback for shared and deliberation second search packets', async () => {
  const { calls, run, tavilyCalls } = createHarness({
    mode: 'deliberation',
    webSearchEnabled: true
  });

  const result = await run([{ text: 'Need current facts' }]);

  assert.equal(result.metadata.sharedSearchPacket, 'search packet 1');
  assert.equal(result.metadata.secondSearchPacket, 'search packet 2');
  assert.deepEqual(tavilyCalls.map((call) => call[2].label), [
    'Shared council web search packet',
    'Second council discussion web search packet'
  ]);
  assert.match(tavilyCalls[0][0], /Need current facts/);
  assert.match(tavilyCalls[1][0], /verify latest facts dates evidence disagreements/);
  assert.deepEqual(calls.map((call) => call.id), ['alpha', 'beta', 'alpha', 'beta', 'synth']);
  assert.match(calls[0].parts[0].text, /Shared council search packet/);
  assert.match(calls[2].parts[0].text, /Council search packet 2/);
});

test('attachment translation packets cover visual and document fallbacks with capability filtering', async () => {
  const translationCalls = [];
  const { calls, run } = createHarness({
    attachmentNeed: {
      needsAnyPacket: true,
      needsVisualPacket: true,
      needsDocumentPacket: true
    },
    getCouncilTranslatorModel: () => ({ id: 'translator', name: 'Translator' }),
    modelSupportsVision: (model) => model.id !== 'alpha',
    modelSupportsDocumentUpload: (model) => model.id !== 'alpha',
    filterPartsForModelCapability: (parts = [], model) => parts.filter((part) => part.text || model.id !== 'alpha'),
    streamImpl: async (parts, onChunk, signal, isWebSearchForced, options = {}) => {
      calls.push({ id: options.modelInfo.id, parts, options });
      if (options.modelInfo.id === 'translator') {
        translationCalls.push(parts);
        return parts[0].text.includes('attached images or videos') ? 'visual packet' : 'document packet';
      }
      onChunk?.(`${options.modelInfo.id}:chunk`);
      return options.modelInfo.id === 'synth' ? 'Synth final' : `${options.modelInfo.name} answer`;
    }
  });
  const parts = [
    { text: 'Describe attachments' },
    { inlineData: { mimeType: 'image/png', data: 'i', name: 'image.png' } },
    { inlineData: { mimeType: 'application/pdf', data: 'd', name: 'doc.pdf' } }
  ];

  const result = await run(parts);
  const alphaCall = calls.find((call) => call.id === 'alpha');
  const betaCall = calls.find((call) => call.id === 'beta');

  assert.deepEqual(translationCalls.map((call) => call[0].text.includes('attached images or videos')), [true, false]);
  assert.equal(result.metadata.attachmentTranslation.visualPacket, 'visual packet');
  assert.equal(result.metadata.attachmentTranslation.documentPacket, 'document packet');
  assert.equal(result.metadata.attachmentTranslation.translatorModelId, 'translator');
  assert.match(alphaCall.parts[0].text, /Attachment translation packet/);
  assert.match(alphaCall.parts[0].text, /visual packet/);
  assert.match(alphaCall.parts[0].text, /document packet/);
  assert.equal(alphaCall.parts.some((part) => part.inlineData), false);
  assert.equal(betaCall.parts.some((part) => part.inlineData?.mimeType === 'image/png'), true);
  assert.equal(betaCall.parts.some((part) => part.inlineData?.mimeType === 'application/pdf'), true);
});

test('attachment translation packet handling preserves missing translator boundary', async () => {
  const { run } = createHarness({
    attachmentNeed: {
      needsAnyPacket: true,
      needsVisualPacket: true,
      needsDocumentPacket: false
    },
    getCouncilTranslatorModel: () => null
  });

  await assert.rejects(
    () => run([{ inlineData: { mimeType: 'image/png', data: 'i', name: 'image.png' } }]),
    /translator model/
  );
});

test('participant-round AbortError follows the current failure aggregation boundary', async () => {
  const abortError = new DOMException('Aborted', 'AbortError');
  const { calls, run } = createHarness({
    streamImpl: async (parts, onChunk, signal, isWebSearchForced, options = {}) => {
      calls.push({ id: options.modelInfo.id, parts, options });
      if (options.modelInfo.id === 'alpha') throw abortError;
      onChunk?.(`${options.modelInfo.id}:chunk`);
      return options.modelInfo.id === 'synth' ? 'Synth final' : 'Beta answer';
    }
  });

  const result = await run();

  assert.equal(result.text, 'Synth final');
  assert.deepEqual(result.metadata.firstRoundResults.map((item) => item.modelId), ['beta']);
  assert.deepEqual(result.metadata.failures.map((item) => [item.modelId, item.error]), [
    ['alpha', 'Aborted']
  ]);
  assert.deepEqual(calls.map((call) => call.id), ['alpha', 'beta', 'synth']);
});

test('empty or missing participant responses preserve the all-failed boundary', async () => {
  const { run } = createHarness({
    streamImpl: async () => ''
  });

  await assert.rejects(
    () => run(),
    /all participant models failed after one retry/
  );
});

test('council lifecycle source avoids DOM, storage, package, and provider parser ownership', () => {
  const source = readSource('src/app/legacy-runtime/features/council-response-lifecycle.js');

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
    'TextDecoder',
    'getReader(',
    'virtual:legacy-app-runtime',
    'vite.config',
    'package.json',
    'REFACTOR_PLAN'
  ]) {
    assert.equal(source.includes(forbidden), false, `source should not include ${forbidden}`);
  }
});
