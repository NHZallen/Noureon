import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCouncilResponseLifecycle } from '../src/app/runtime/council/council-response-lifecycle.js';

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
  buildSearchQuery,
  readLinkedPages,
  readsLinkedPages,
  filterPartsForModelCapability,
  getCouncilSharedSearchModel,
  getCouncilTranslatorModel,
  modelSupportsDocumentUpload = () => true,
  modelUsesNativeWebSearch = () => false,
  streamImpl,
  createMembers = null,
  modelSupportsVision = () => true
} = {}) => {
  const calls = [];
  const tavilyCalls = [];
  const queryConversations = [];
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
    getSearchQueryFromParts: (parts = [], conversation = null) => {
      queryConversations.push(conversation);
      return parts.map((part) => part.text || '').join(' ');
    },
    fetchTavilySearchPacket: fetchTavilySearchPacket || (async (...args) => {
      tavilyCalls.push(args);
      return `search packet ${tavilyCalls.length}`;
    }),
    ...(buildSearchQuery ? { buildSearchQuery } : {}),
    ...(readLinkedPages ? { readLinkedPages } : {}),
    ...(readsLinkedPages ? { readsLinkedPages } : {}),
    streamCouncilApiCallWithRetry: streamImpl || defaultStream,
    ...(createMembers ? { createMembers } : {}),
    modelSupportsVision,
    modelSupportsDocumentUpload
  });

  return {
    calls,
    finalChunks,
    lifecycle,
    progressEvents,
    queryConversations,
    tavilyCalls,
    run: (parts = [{ text: 'Question' }], signal = new AbortController().signal, requestOptions = {}) =>
      lifecycle.runModelCouncil(
        parts,
        signal,
        (progress) => progressEvents.push(progress),
        (chunk) => finalChunks.push(chunk),
        requestOptions
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

test('without members of its own a council does not search: one call for each member, and no search stage', async () => {
  const { calls, progressEvents, run, tavilyCalls } = createHarness({ webSearchEnabled: true, mode: 'deliberation' });
  const result = await run([{ text: 'Need current facts' }]);
  assert.deepEqual(calls.map((call) => call.id), ['alpha', 'beta', 'alpha', 'beta', 'synth']);
  assert.equal(tavilyCalls.length, 0, 'no shared search packet any more');
  assert.ok(progressEvents.every((event) => event.stage !== 'search' && event.search === null));
  assert.ok(progressEvents.every((event) => event.searchEnabled === true), 'the panel still knows the search is on');
  assert.deepEqual(result.sources, []);
  assert.equal(result.metadata.sharedSearchPacket, null);
});

test('each member answers through the council\'s members (its own search), in both rounds; their steps reach the panel and their pages the synthesis', async () => {
  const asked = [];
  const sourcesSeen = [];
  let made = null;
  const { calls, progressEvents, run } = createHarness({
    mode: 'deliberation',
    webSearchEnabled: false,
    createMembers: (conversation, parts) => {
      made = { conversation, parts };
      return {
        async answer(options) {
          asked.push(options);
          options.onStep({ kind: 'search', label: `Searching: ${options.modelInfo.id}` });
          options.onStep({ kind: 'page', label: 'Reading page: a.example' });
          options.onChunk('words');
          return `${options.modelInfo.name} says [1] (${options.requestOptions.requestPurpose})`;
        },
        sources: () => {
          const list = [{ n: 1, url: 'https://a.example/', title: 'A page' }, { n: 1, url: 'https://a.example/', title: 'A page', read: true }];
          sourcesSeen.push(list);
          return list;
        }
      };
    }
  });
  const result = await run([{ text: 'Need current facts' }], new AbortController().signal, { webSearchEnabled: true });
  assert.equal(made.parts[0].text, 'Need current facts');
  assert.equal(made.conversation.messages.at(-1).parts[0].text, 'Current question');
  assert.deepEqual(asked.map((options) => [options.modelInfo.id, options.requestOptions.requestPurpose, options.searchOn]), [
    ['alpha', 'council-participant', true], ['beta', 'council-participant', true],
    ['alpha', 'council-deliberation', true], ['beta', 'council-deliberation', true]
  ], 'the search of the request reaches every member, in both rounds');
  assert.match(asked[0].requestOptions.additionalSystemInstruction, /只能讀，不能改任何東西/);
  assert.match(asked[2].parts[0].text, /\[1\] A page — https:\/\/a\.example\/（成員讀過全文）/, 'the deliberation lists the pages met, with their numbers');
  assert.deepEqual(calls.map((call) => call.id), ['synth'], 'only the synthesis is a plain call');
  assert.match(calls[0].parts[0].text, /# 成員查到的來源/);
  assert.match(calls[0].parts[0].text, /\[1\] A page — https:\/\/a\.example\//);
  assert.match(calls[0].parts[0].text, /只用清單裡有的編號/);
  assert.equal(result.sources.length, 2, 'the pages go with the answer');
  const last = progressEvents.filter((event) => event.stage === 'firstRound').at(-1);
  const alpha = last.modelStates.find((state) => state.modelId === 'alpha');
  assert.deepEqual(alpha.counts, { search: 1, page: 1, skill: 0, connector: 0 });
  assert.deepEqual(alpha.steps.map((step) => step.kind), ['search', 'page']);
});

test('a member whose answer fails is a failure of the council as before, and a stop of the council reaches the member\'s signal', async () => {
  const controller = new AbortController();
  const signals = [];
  const { run } = createHarness({
    createMembers: () => ({
      async answer(options) {
        signals.push(options.signal);
        if (options.modelInfo.id === 'beta') throw new Error('beta broke');
        return 'alpha answer';
      },
      sources: () => []
    })
  });
  const result = await run([{ text: 'Q' }], controller.signal);
  assert.deepEqual(result.metadata.failures.map((failure) => [failure.modelId, failure.error]), [['beta', 'beta broke']]);
  controller.abort();
  assert.ok(signals.every((signal) => signal.aborted));
});

test('web addresses in the message are read once for the whole council, and go to the first round and the synthesis', async () => {
  const reads = [];
  const { calls, run } = createHarness({
    readsLinkedPages: (model) => model.id === 'alpha',
    readLinkedPages: async (parts) => {
      reads.push(parts);
      return '# Web pages the user linked (system-generated)\nPage text';
    }
  });

  await run([{ text: 'Summarise https://example.org/a' }]);

  assert.equal(reads.length, 1, 'read once, not once for each model');
  const byModel = (id) => calls.filter((call) => call.id === id);
  for (const id of ['alpha', 'beta']) {
    assert.match(byModel(id)[0].parts[0].text, /Web pages the user linked/, `${id} gets the pages`);
    assert.equal(byModel(id)[0].parts.at(-1).text, 'Summarise https://example.org/a', 'and then the question');
  }
  assert.ok(byModel('synth').at(-1).parts.some((part) => /Web pages the user linked/.test(part.text)), 'the synthesizer too');
});

test('the council reads nothing when none of its models needs it, and carries on when the reading fails', async () => {
  const none = [];
  const { run: runNone } = createHarness({
    readsLinkedPages: () => false,
    readLinkedPages: async () => { none.push(1); return 'x'; }
  });
  await runNone([{ text: 'Summarise https://example.org/a' }]);
  assert.equal(none.length, 0);

  const { calls, run } = createHarness({
    readsLinkedPages: () => true,
    readLinkedPages: async () => { throw new Error('reader exploded'); }
  });
  await run([{ text: 'Summarise https://example.org/a' }]);
  assert.ok(calls.length >= 3, 'the council still answers');
  assert.doesNotMatch(calls[0].parts[0].text, /Web pages/);
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
  const source = readSource('src/app/runtime/council/council-response-lifecycle.js');

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

test('the skills asked for with "/" in the message are in every call of the council (the members, the second round and the synthesis), and none is added otherwise', async () => {
  const { registerSkillMode } = await import('../src/app/runtime/skill/skill-bridge.js');
  const { skillIndicatorId } = await import('../src/data/skill-prompt.js');
  registerSkillMode({ resolve: async (names) => names.filter((name) => name === 'meeting-notes').map((name) => ({ name, body: 'List the decisions first.' })) });
  try {
    const asked = createHarness({ mode: 'deliberation' });
    await asked.run([{ text: 'Question', displaySegments: [{ type: 'mode', indicatorId: skillIndicatorId('meeting-notes'), label: 'meeting-notes' }, { type: 'text', text: 'Question' }] }]);
    assert.ok(asked.calls.length >= 5, 'two members, two corrections, the synthesis');
    for (const call of asked.calls) assert.match(call.options.additionalSystemInstruction, /<skill name="meeting-notes">\nList the decisions first\.\n<\/skill>/, call.id);
    const plain = createHarness({ mode: 'deliberation' });
    await plain.run();
    for (const call of plain.calls) assert.doesNotMatch(String(call.options.additionalSystemInstruction), /<skill name=/);
  } finally {
    registerSkillMode(null);
  }
});

test('the synthesis may be made as a reply: it is given the request, what the synthesizer is told and the members\' pages, and what it gives comes back', async () => {
  const given = [];
  const { calls, finalChunks, run } = createHarness({
    showRawResponses: true,
    createMembers: () => ({ answer: async (options) => `${options.modelInfo.name} [1]`, sources: () => [{ n: 1, url: 'https://a.example/', title: 'A' }] })
  });
  const result = await run([{ text: 'Q' }], new AbortController().signal, {
    synthesize: async (request) => {
      given.push(request);
      return { text: '```noureon-run\n{}\n```\n\nMade [1]', extraParts: [{ sandboxFile: { name: 'a.pptx' } }] };
    }
  });
  assert.equal(calls.length, 0, 'no plain call: the reply made it');
  assert.deepEqual(finalChunks, []);
  assert.equal(given[0].synthesizer.id, 'synth');
  assert.match(given[0].parts[0].text, /# 成員查到的來源/);
  assert.match(given[0].instruction, /You are the council synthesizer/);
  assert.deepEqual(given[0].sources.map((source) => source.n), [1]);
  assert.match(result.text, /^```noureon-run\n\{\}\n```\n\nMade \[1\]\n\n<details class="council-collapse">/, 'the record of the answers follows the reply');
  assert.equal(result.synthesis.extraParts[0].sandboxFile.name, 'a.pptx');

  const failing = createHarness({ createMembers: () => ({ answer: async () => 'member', sources: () => [] }) });
  const fallback = await failing.run([{ text: 'Q' }], new AbortController().signal, { synthesize: async () => { throw new Error('synth down'); } });
  assert.match(fallback.text, /未能完成統整：synth down/);
  assert.equal(fallback.synthesis, undefined);
});
