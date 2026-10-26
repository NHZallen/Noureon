import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { prepareReply } from '../src/app/runtime/reply/single-model-reply-prepare.js';
import { followServerReply, handOverToServer } from '../src/app/runtime/reply/single-model-reply-server.js';
import { createReplyLiveView } from '../src/app/runtime/reply/single-model-reply-live-view.js';
import { createLocalReply } from '../src/app/runtime/reply/single-model-reply-local.js';
import { composeReplyText, recordReplyRun } from '../src/app/runtime/reply/single-model-reply-finish.js';
import { liftSandboxRunBlock } from '../src/app/ui/sandbox/sandbox-run-block.js';

const modelInfo = { id: 'm', name: 'Model', provider: 'openrouter' };
const conversation = { id: 'c1', messages: [] };
const baseRequest = { userParts: [{ text: 'Hello there' }], modelInfo, conversation, webSearchEnabled: false, resumeRun: null, synthesis: null, assistantMessageId: 'a1' };
const deps = (overrides = {}) => ({ getConfig: () => ({}), supportsToolCalling: null, webResearch: null, serverReply: null, getWindow: () => undefined, ...overrides });

test('prepare: without a server the reply is planned here; a search packet the server makes is not prepared on the page', async () => {
  const alone = await prepareReply(deps(), baseRequest);
  assert.equal(alone.plan, null);
  assert.equal(alone.replyMode.advanced, false);
  assert.equal(alone.hasTranslationInputs, false);

  const asked = [];
  const serverReply = { plan: (context) => { asked.push(context); return { ok: true, webSearch: 'packet' }; } };
  const searching = await prepareReply(deps({ serverReply }), { ...baseRequest, webSearchEnabled: true });
  assert.equal(searching.serverSearches, true);
  assert.equal(searching.hasTranslationInputs, false, 'the server makes the search packet');
  assert.equal(asked[0].webSearchEnabled, true);

  const resumed = await prepareReply(deps({ serverReply }), { ...baseRequest, resumeRun: { follow() {} } });
  assert.equal(resumed.plan, null, 'a reply picked up again is only followed');
});

test('hand-over: a server that takes the reply gives its run; one whose sandbox is down makes it here and says so', async () => {
  const notices = [];
  const prep = { plan: { ok: true, webSearch: 'off' }, canCallTools: false, cli: { chosen: [], ids: [] }, replyMode: { advanced: true }, ownSearchReply: false, availableSkills: [], serverPrepares: false, hasAddresses: false, skillOptions: {} };
  const request = { ...baseRequest, uiLanguage: 'en', requestParts: baseRequest.userParts, sequence: 1, onMemoryContextResolved() {}, getHistorySourceIds: () => [] };
  const serverReply = (started) => ({ start: async () => started, notify: (kind) => notices.push(kind) });

  const run = { id: 'r1' };
  assert.deepEqual(await handOverToServer({ serverReply: serverReply({ ok: true, run }), getConfig: () => ({}) }, request, prep), { serverRun: run, madeHere: false });
  assert.deepEqual(await handOverToServer({ serverReply: serverReply({ ok: false, notify: 'sandbox' }), getConfig: () => ({}) }, request, prep), { serverRun: null, madeHere: true });
  assert.deepEqual(notices, ['sandbox']);
  assert.deepEqual(await handOverToServer({ serverReply: serverReply({ ok: false, notify: 'busy' }), getConfig: () => ({}) }, request, prep), { serverRun: null, madeHere: true });
  assert.deepEqual(notices, ['sandbox'], 'busy is said on the reply\'s line only');
  assert.deepEqual(await handOverToServer({ serverReply: serverReply({ ok: false, notify: false }), getConfig: () => ({}) }, request, { ...prep, plan: { ok: false } }), { serverRun: null, madeHere: false });
});

test('following the server: its words, run record and files go into the reply; a lost sandbox makes the reply here', async () => {
  const view = createReplyLiveView({ targetElement: {}, getDocument: () => null, getConfig: () => ({}), language: 'en', now: () => 0, serverReply: null, serverRun: null, madeHere: false, getRunStartedAt: () => 0, onStepsShown() {} });
  const reply = { searchSources: [], sandboxParts: [], sandboxRun: null };
  const words = [];
  const serverRun = {
    follow: async ({ onText, onRun }) => {
      onRun({ sources: [{ n: 1, url: 'https://a.example' }] });
      onText('Hi');
      return { text: 'Hi', run: { status: 'done', steps: [], sources: [{ n: 1, url: 'https://a.example' }] }, extraParts: [] };
    }
  };
  const lifecycle = { serverReply: { noteVision() {}, localizeError: (error) => error }, now: () => 0, setRunStartedAt() {}, getRunStartedAt: () => 0 };
  const text = await followServerReply(lifecycle, { serverRun, reply, view, progress() {}, uiLanguage: 'en', advanced: true, runHere: async () => 'here' }, (chunk) => words.push(chunk));
  assert.equal(text, 'Hi');
  assert.deepEqual(words, ['Hi']);
  assert.equal(view.answered, true);
  assert.equal(reply.sandboxRun.status, 'done');
  assert.equal(reply.searchSources.length, 1);

  const lost = { follow: async () => { const error = new Error('gone'); error.code = 'sandbox_unavailable'; throw error; } };
  assert.equal(await followServerReply(lifecycle, { serverRun: lost, reply, view, progress() {}, uiLanguage: 'en', advanced: true, runHere: async () => 'made here' }, () => {}), 'made here');
  assert.equal(reply.sandboxRun, null);
});

test('following the server when it cuts the reply: the cut goes with the reply, and a message cut to nothing but its process line is not an empty reply', async () => {
  const view = createReplyLiveView({ targetElement: {}, getDocument: () => null, getConfig: () => ({}), language: 'en', now: () => 0, serverReply: null, serverRun: null, madeHere: false, getRunStartedAt: () => 0, onStepsShown() {} });
  const reply = { searchSources: [], sandboxParts: [], sandboxRun: null, groundingSupports: [], sandboxDocuments: '' };
  const cut = { next: 'next-message', sequence: 4, users: [{ id: 'u', text: 'make it a table', sequence: 3 }] };
  const serverRun = { follow: async () => ({ text: '', run: { status: 'done', steps: [], segment: true, elapsedMs: 9000 }, extraParts: [], steersLeft: ['left'], segment: cut }) };
  const lifecycle = { serverReply: { noteVision() {}, localizeError: (error) => error }, now: () => 0, setRunStartedAt() {}, getRunStartedAt: () => 0 };
  const text = await followServerReply(lifecycle, { serverRun, reply, view, progress() {}, uiLanguage: 'en', advanced: false, runHere: async () => 'here' }, () => {});
  assert.equal(text, '');
  assert.deepEqual(reply.cut, cut);
  assert.deepEqual(reply.steersLeft, ['left']);
  const composed = composeReplyText({ reply, fullResponse: text, targetElement: { dataset: {} }, aborted: false, uiLanguage: 'en' });
  assert.equal(liftSandboxRunBlock(composed).run.segment, true, 'the message is its process line');
});

test('the live view tells once that the model searches by itself, and not for an event of long ago', () => {
  let time = 100_000;
  const notices = [];
  const view = createReplyLiveView({ targetElement: {}, getDocument: () => null, getConfig: () => ({}), language: 'en', now: () => time, serverReply: { notify: (kind) => notices.push(kind) }, serverRun: null, madeHere: false, getRunStartedAt: () => 0, onStepsShown() {} });
  view.noteOwnSearch({ type: 'searching' }, { at: time - 60_000 });
  assert.deepEqual(notices, [], 'an old event a late page is sent again is not news');
  view.noteOwnSearch({ type: 'step' });
  view.noteOwnSearch({ type: 'searching' });
  view.noteOwnSearch({ type: 'searching' });
  assert.deepEqual(notices, ['model-searches']);

  view.showThinking('Let me see', 'raw');
  time += 2000;
  view.answering();
  assert.equal(view.thought.text, 'Let me see');
  assert.equal(view.thought.endedAt - view.thought.startedAt, 2000);
});

test('made here without Python: the stream of words, after a skill loop the provider refused', async () => {
  const view = createReplyLiveView({ targetElement: {}, getDocument: () => null, getConfig: () => ({}), language: 'en', now: () => 0, serverReply: null, serverRun: null, madeHere: false, getRunStartedAt: () => 0, onStepsShown() {} });
  const reply = { requestParts: [{ text: 'Hi' }], searchSources: [], addSearchSources() {} };
  const calls = [];
  const streamApiCall = async (parts, onChunk) => {
    calls.push(parts);
    onChunk('Hello');
    return 'Hello';
  };
  const local = createLocalReply({ streamApiCall, buildSingleModelTranslatedRequestParts: async () => [], getConfig: () => ({}), webResearch: null, now: () => 0 }, {
    request: { ...baseRequest, signal: null, uiLanguage: 'en' },
    prep: { researchByModel: false, invokedSkills: [], makeSkillLoader: () => null },
    reply,
    view,
    streamOptions: {}
  });
  const chunks = [];
  assert.equal(await local.runStandard((chunk) => chunks.push(chunk)), 'Hello');
  assert.deepEqual(chunks, ['Hello']);
  assert.equal(view.answered, true);
  assert.deepEqual(calls, [[{ text: 'Hi' }]]);
});

test('finish: the run record keeps the thinking, the pages and "made here"; the text gets the run above it; nothing at all is an error', () => {
  const reply = { searchSources: [{ n: 1, url: 'https://a.example', title: 'A' }], sandboxRun: null, sandboxDocuments: '', groundingSupports: [] };
  recordReplyRun({ reply, thought: { text: 'Hmm', kind: 'raw', startedAt: 10, endedAt: 1510 }, answered: true, advanced: false, serverRun: null, madeHere: true, aborted: false, elapsedMs: 4000 });
  assert.equal(reply.sandboxRun.thought, 'Hmm');
  assert.equal(reply.sandboxRun.thoughtMs, 1500);
  assert.equal(reply.sandboxRun.madeHere, true);
  assert.equal(reply.sandboxRun.sources.length, 1);

  const target = { dataset: { streamRendered: 'true' } };
  const text = composeReplyText({ reply, fullResponse: 'The answer', targetElement: target, aborted: false, uiLanguage: 'en' });
  const lifted = liftSandboxRunBlock(text);
  assert.equal(lifted.text, 'The answer');
  assert.equal(lifted.run.madeHere, true);
  assert.equal(target.dataset.streamRendered, 'false', 'drawn again with the run row');

  const empty = { searchSources: [], sandboxRun: null, sandboxDocuments: '', groundingSupports: [] };
  assert.throws(() => composeReplyText({ reply: empty, fullResponse: '  ', targetElement: null, aborted: false, uiLanguage: 'en' }));
  assert.throws(() => composeReplyText({ reply: empty, fullResponse: '', targetElement: null, aborted: true, uiLanguage: 'en' }), { name: 'AbortError' });
});

test('when the files are being kept, a grey card stands where they will be, once, and is not there when there are no files to wait for', () => {
  const { document } = new Window();
  const bubble = document.createElement('div');
  const target = document.createElement('div');
  bubble.append(target);
  document.body.append(bubble);
  const view = createReplyLiveView({ targetElement: target, getDocument: () => document, getConfig: () => ({}), language: 'en', now: () => 0, serverReply: null, serverRun: null, madeHere: false, getRunStartedAt: () => 0, onStepsShown() {} });
  assert.equal(target.querySelectorAll('.file-skeleton').length, 0);
  view.event({ type: 'finishing', label: 'Saving the files' });
  view.event({ type: 'finishing', label: 'Saving the files' });
  assert.equal(target.querySelectorAll('.file-skeleton').length, 1, 'one card, not one for each event');
  assert.equal(target.querySelector('.file-skeleton').classList.contains('ac-file-card'), true);
  view.close();
});
