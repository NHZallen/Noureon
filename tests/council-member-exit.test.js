import assert from 'node:assert/strict';
import test from 'node:test';

import { createCouncilResponseLifecycle } from '../src/app/legacy-runtime/features/council-response-lifecycle.js';

const models = ['alpha', 'beta', 'gamma', 'synth'].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), provider: 'openrouter' }));
const runtimeTexts = { completed: 'completed', deliberation: 'deliberation', done: 'done', failed: 'failed', firstRound: 'first round', noVisionParticipants: 'none', retrying: 'retrying', running: 'running', searchDone: 'd', searchFailed: 'f', searchRunning: 's', skippedVisualReason: 'v', synthesis: 'synthesis', exited: 'left' };
const texts = { comparisonTableTitle: 'C', consensusMode: 'Consensus', deliberationMode: 'Deliberation', rawNotes: 'Raw', synthesizer: 'S', title: 'Council' };

// Members that answer only when `release(id)` is called (or fail to, when they are told to leave), and records of what the council asked.
const harness = ({ mode = 'consensus', participants = ['alpha', 'beta', 'gamma'] } = {}) => {
  const pending = new Map();
  const calls = [];
  const synthesisPrompts = [];
  const progress = [];
  const exits = [];
  const stream = (parts, onChunk, signal, force, options = {}) => new Promise((resolve, reject) => {
    const id = options.modelInfo.id;
    calls.push({ id, purpose: options.requestPurpose, aborted: () => signal?.aborted });
    if (id === 'synth') {
      synthesisPrompts.push(parts.map((part) => part.text || '').join('\n'));
      resolve('Synth final');
      return;
    }
    const answer = () => resolve(`${id} says hello`);
    const stop = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) return stop();
    signal?.addEventListener('abort', stop, { once: true });
    const waiting = pending.get(id) || [];
    waiting.push(answer);
    pending.set(id, waiting);
  });
  const lifecycle = createCouncilResponseLifecycle({
    buildTavilySearchQuery: (value) => String(value || ''),
    getSearchCurrentDate: () => '2026-06-24',
    getConfig: () => ({ uiLanguage: 'en' }),
    getActiveConversation: () => ({ isWebSearchEnabled: false, messages: [{ role: 'user', parts: [{ text: 'Question' }] }] }),
    getCouncilSelectedModels: () => ({ council: { mode, showRawResponses: false, showComparisonTable: false }, participants: participants.map((id) => models.find((model) => model.id === id)), synthesizer: models[3] }),
    getCouncilTexts: () => texts,
    getCouncilRuntimeTexts: () => runtimeTexts,
    getCouncilAttachmentTranslationNeed: () => ({ needsAnyPacket: false }),
    getCouncilTranslatorModel: () => null,
    getCouncilSharedSearchModel: (synth) => synth,
    models,
    councilMaxModels: 5,
    extractTextFromParts: (parts = []) => parts.map((part) => part.text || '').join('\n'),
    truncateCouncilText: (value = '') => String(value || ''),
    filterPartsForModelCapability: (parts = []) => parts,
    getSearchQueryFromParts: () => 'q',
    fetchTavilySearchPacket: async () => 'packet',
    streamCouncilApiCallWithRetry: stream,
    modelUsesNativeWebSearch: () => false,
    modelSupportsVision: () => true,
    modelSupportsDocumentUpload: () => true
  });
  const run = (extra = {}, signal = undefined) => lifecycle.runModelCouncil([{ text: 'Question' }], signal, (state) => progress.push(state), () => {}, { onMemberExit: (id) => exits.push(id), ...extra });
  // Lets the members that are waiting answer, one at a time; resolves once nobody is left waiting for that id.
  const answer = async (id) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    for (const resolveAnswer of pending.get(id) || []) resolveAnswer();
    pending.set(id, []);
    await new Promise((resolve) => setTimeout(resolve, 5));
  };
  const last = () => progress.at(-1);
  const state = (id) => last().modelStates.find((item) => item.modelId === id);
  return { run, answer, calls, synthesisPrompts, progress, exits, last, state };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test('a model that is still answering can leave: the council goes on without it, and its answer is nowhere', async () => {
  const h = harness();
  const done = h.run();
  await tick();
  assert.equal(h.state('alpha').canExit, true, 'a model that is answering can be asked to leave');
  assert.equal(typeof h.last().exit, 'function', 'the progress hands out what makes it leave');
  assert.equal(h.last().exit('alpha'), true);
  assert.equal(h.state('alpha').status, 'exited');
  assert.equal(h.state('alpha').detail, 'left');
  assert.deepEqual(h.exits, ['alpha'], 'whoever keeps the council is told');
  await h.answer('beta');
  await h.answer('gamma');
  const result = await done;
  assert.equal(result.text, 'Synth final');
  const prompt = h.synthesisPrompts[0];
  assert.match(prompt, /beta says hello/);
  assert.match(prompt, /gamma says hello/);
  assert.doesNotMatch(prompt, /alpha says hello/, 'it did not take part');
  assert.deepEqual(result.metadata.exitedParticipantModelIds, ['alpha']);
  assert.deepEqual(result.metadata.failures, [], 'leaving is not a failure');
  assert.deepEqual(result.metadata.firstRoundResults.map((entry) => entry.modelId), ['beta', 'gamma']);
});

test('a model that left while it was answering is not counted even if its answer was about to arrive', async () => {
  const h = harness();
  const done = h.run();
  await tick();
  h.last().exit('beta');
  await h.answer('beta');
  await h.answer('alpha');
  await h.answer('gamma');
  const result = await done;
  assert.deepEqual(result.metadata.firstRoundResults.map((entry) => entry.modelId), ['alpha', 'gamma']);
});

test('at least two models stay: the last two cannot leave, and a model that is done or has failed cannot either', async () => {
  const h = harness();
  const done = h.run();
  await tick();
  assert.equal(h.last().exit('alpha'), true);
  assert.equal(h.state('beta').canExit, false, 'two would not be left if beta went too');
  assert.equal(h.state('gamma').canExit, false);
  assert.equal(h.last().exit('beta'), false);
  assert.equal(h.state('beta').status, 'running');
  await h.answer('beta');
  assert.equal(h.state('beta').status, 'done');
  assert.equal(h.last().exit('beta'), false, 'an answer that is in cannot be taken back this way');
  await h.answer('gamma');
  await done;
});

test('with four models, one leaving leaves three who can still be asked to leave one more at a time down to two', async () => {
  const h = harness({ participants: ['alpha', 'beta', 'gamma', 'synth'] });
  const done = h.run();
  await tick();
  assert.equal(h.state('alpha').canExit, true);
  assert.equal(h.last().exit('alpha'), true);
  assert.equal(h.state('beta').canExit, true, 'three are left: one more may go');
  assert.equal(h.last().exit('beta'), true);
  assert.equal(h.state('gamma').canExit, false, 'two are left');
  await h.answer('gamma');
  const result = await done;
  assert.ok(result.text);
});

test('a model that leaves in the discussion takes its first answer with it; the others have the discussion without it', async () => {
  const h = harness({ mode: 'deliberation' });
  const done = h.run();
  await tick();
  await h.answer('alpha');
  await h.answer('beta');
  await h.answer('gamma');
  await tick();
  assert.equal(h.last().stage, 'deliberation');
  assert.equal(h.state('alpha').canExit, true, 'in the discussion too');
  assert.equal(h.last().exit('alpha'), true);
  await h.answer('beta');
  await h.answer('gamma');
  const result = await done;
  assert.doesNotMatch(h.synthesisPrompts[0], /alpha says hello/, 'neither its first answer nor a second one');
  assert.deepEqual(result.metadata.firstRoundResults.map((entry) => entry.modelId), ['beta', 'gamma']);
  assert.deepEqual(result.metadata.finalRoundResults.map((entry) => entry.modelId), ['beta', 'gamma']);
  assert.deepEqual(result.metadata.failures, []);
});

test('a council taken up after a restart does not ask the models that had left', async () => {
  const h = harness();
  const done = h.run({ exitedModelIds: ['alpha'] });
  await tick();
  assert.equal(h.state('alpha').status, 'exited');
  assert.equal(h.calls.filter((call) => call.id === 'alpha').length, 0, 'it is not asked');
  await h.answer('beta');
  await h.answer('gamma');
  const result = await done;
  assert.deepEqual(result.metadata.firstRoundResults.map((entry) => entry.modelId), ['beta', 'gamma']);
  assert.doesNotMatch(h.synthesisPrompts[0], /alpha says hello/);
});

test('stopping the council still stops everyone, and a stop is not taken for a model leaving', async () => {
  const h = harness();
  const controller = new AbortController();
  const done = h.run({}, controller.signal).then(() => null, (error) => error);
  await tick();
  controller.abort();
  const failure = await done;
  assert.ok(failure, 'the council ended');
  assert.deepEqual(h.exits, [], 'nobody left: the council was stopped');
  assert.equal(h.calls.some((call) => call.id === 'synth'), false, 'and nothing was synthesized');
});
