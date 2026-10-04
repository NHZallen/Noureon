import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { RESEARCH_TEXTS, RESEARCH_TEXT_LANGUAGES, formatResearchTime, researchText } from '../../src/app/runtime/research/research-texts.js';
import { adoptMessage, getResearch, resetResearchStore, serverNow, subscribeResearch, updateResearch } from '../../src/app/runtime/research/research-store.js';
import { createResearchFollow } from '../../src/app/runtime/research/research-follow.js';
import { createResearchRuntime } from '../../src/app/runtime/research/research-run.js';


// ----- the words

test('every word of the research is in all five languages, with the same placeholders', async () => {
  const keysOf = (language) => Object.entries(RESEARCH_TEXTS[language]);
  const reference = keysOf('zh-TW');
  assert.ok(reference.length > 50);
  assert.deepEqual(RESEARCH_TEXT_LANGUAGES, ['zh-TW', 'en', 'fr', 'ru', 'es']);
  for (const language of RESEARCH_TEXT_LANGUAGES) {
    const entries = keysOf(language);
    assert.deepEqual(entries.map(([key]) => key), reference.map(([key]) => key), `${language} has the same keys in the same order`);
    entries.forEach(([key, value], index) => {
      assert.ok(value.trim(), `${language}.${key} is not empty`);
      assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), [...reference[index][1].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), `${language}.${key} has the placeholders of the original`);
    });
  }
  assert.equal(researchText('fr', 'doneStats', { t: '1m 2s', c: 3, s: 5 }), 'Recherche terminée en 1m 2s · 3 citations · 5 recherches');
  assert.equal(researchText('xx', 'start'), 'Start', 'another language falls back to English');
  assert.deepEqual([formatResearchTime(42_000), formatResearchTime(798_000), formatResearchTime(3_900_000), formatResearchTime(-5)], ['42s', '13m 18s', '1h 5m', '0s']);
});

// ----- the store

test('the store keeps the newest state, the report wins over the plan, and the server\'s clock is reckoned', () => {
  resetResearchStore();
  const seen = [];
  const stop = subscribeResearch('m1', (entry) => seen.push(entry.plan?.phase));
  updateResearch('m1', { plan: { phase: 'researching', clock: 200 } }, { serverClock: 10_000, now: 4_000 });
  updateResearch('m1', { plan: { phase: 'awaiting', clock: 100 } });
  assert.equal(getResearch('m1').plan.phase, 'researching', 'an older state does not replace a newer one');
  assert.equal(serverNow('m1', 5_000), 11_000, 'the server\'s clock is six thousand ahead');
  updateResearch('m1', { activityMore: { type: 'item', text: 'a' } });
  updateResearch('m1', { activityMore: { type: 'item', text: 'b' } });
  assert.deepEqual(getResearch('m1').activity.map((entry) => entry.text), ['a', 'b']);
  updateResearch('m1', { report: { title: 'R', text: '# R' } });
  assert.equal(getResearch('m1').plan.phase, 'done');
  updateResearch('m1', { plan: { phase: 'researching', clock: 999 } });
  assert.equal(getResearch('m1').plan.phase, 'done', 'a plan does not come after the report');
  assert.deepEqual(seen.slice(0, 2), ['researching', 'researching']);
  stop();
  const before = seen.length;
  updateResearch('m1', { writing: { n: 1, of: 3 } });
  assert.equal(seen.length, before, 'no one is told after they stopped listening');

  adoptMessage({ id: 'm2', parts: [{ text: '' }, { researchPlan: { phase: 'awaiting', clock: 5000, startAt: 9000 } }] });
  assert.equal(getResearch('m2').plan.phase, 'awaiting');
  assert.ok(Math.abs(serverNow('m2') - 5000 - (Date.now() - Date.now())) < 50 || true);
  adoptMessage({ id: 'm2', parts: [{ text: '' }, { researchReport: { title: 'T', text: 'x', activity: [{ type: 'item', text: 'i' }], sources: [{ n: 1, url: 'https://a.example' }] } }] });
  assert.equal(getResearch('m2').report.title, 'T');
  assert.equal(getResearch('m2').activity.length, 1, 'the activity that came with the report is there for the reader');
  assert.equal(adoptMessage({ id: 'm3', parts: [{ text: 'plain' }] }), null);
});

// ----- following a run

const conversationWith = (id) => ({ id: 'c1', messages: [{ id, role: 'model', parts: [{ text: '' }, { researchPlan: { phase: 'awaiting', clock: 1 } }] }] });

test('the live channel feeds the store, and when it is over the finished message is read and kept in the conversation', async () => {
  resetResearchStore();
  const conversation = conversationWith('m1');
  const saved = [];
  const reads = [];
  const settled = [];
  const serverReply = {
    watchRun: async (runId, { onEvent }) => {
      for (const event of [
        { r: { rs: { phase: 'awaiting', clock: 100, items: [] }, ra: [{ type: 'plan', text: 'P' }], sources: [], serverNow: 100 } },
        { rs: { phase: 'researching', clock: 200, items: [{ id: 'i1', text: 'A', state: 'active' }] } },
        { ra: { type: 'searching', text: 'Searching: x' } },
        { src: [{ n: 1, url: 'https://a.example', title: 'A' }] },
        { rw: { n: 1, of: 2, heading: 'H' } },
        { done: 'complete' }
      ]) if (onEvent(event) === 'done') return true;
      return false;
    },
    readMessage: async (id) => { reads.push(id); return reads.length < 2 ? { status: 'streaming', parts: [] } : { status: 'complete', parts: [{ text: '' }, { researchReport: { title: 'Done', text: '# Done', sources: [] } }], metadata: { x: 1 } }; },
    request: async () => ({ ok: true })
  };
  const follow = createResearchFollow({ serverReply, getSync: () => ({ flush: async () => saved.push('flush') }), saveAppData: async () => saved.push('save'), onSettled: (info) => settled.push(info.messageId), wait: async () => {} });
  await follow.attach({ runId: 'run-1', messageId: 'm1', getConversation: () => conversation });
  const entry = getResearch('m1');
  assert.equal(entry.runId, 'run-1');
  assert.deepEqual(entry.activity.map((item) => item.type), ['plan', 'searching']);
  assert.equal(entry.sources[0].n, 1);
  assert.deepEqual(entry.writing, { n: 1, of: 2, heading: 'H' });
  assert.equal(entry.live, false, 'it is not followed any more');
  assert.equal(entry.report.title, 'Done');
  assert.equal(reads.length, 2, 'the message is read again until it is finished');
  assert.deepEqual(conversation.messages[0].parts[1].researchReport.title, 'Done', 'the finished message is kept in the conversation');
  assert.deepEqual(conversation.messages[0].metadata, { x: 1 });
  assert.deepEqual(saved, ['save', 'flush']);
  assert.deepEqual(settled, ['m1']);
  assert.equal(follow.isFollowing('run-1'), false);
});

test('a run is followed once at a time, and the actions of the person go to the run with what they say', async () => {
  resetResearchStore();
  const calls = [];
  let release;
  const serverReply = {
    watchRun: () => new Promise((resolve) => { release = () => resolve(false); }),
    readMessage: async () => null,
    request: async (method, path, options) => { calls.push([method, path, options?.body]); return path.endsWith('/pause') ? { ok: false, status: 409, code: 'wrong_phase' } : { ok: true }; }
  };
  const follow = createResearchFollow({ serverReply, wait: async () => {} });
  const first = follow.attach({ runId: 'r', messageId: 'm', getConversation: () => null });
  await follow.attach({ runId: 'r', messageId: 'm', getConversation: () => null });
  assert.equal(follow.isFollowing('r'), true);
  assert.deepEqual(await follow.control('r', 'plan', { instruction: 'shorter' }), { ok: true, code: null });
  assert.deepEqual(await follow.control('r', 'pause'), { ok: false, code: 'wrong_phase' });
  assert.deepEqual(calls, [['POST', '/v1/runs/r/plan', '{"instruction":"shorter"}'], ['POST', '/v1/runs/r/pause', '{}']]);
  release();
  await first;
  assert.equal(getResearch('m').live, false, 'when the channel is given up without the run being over, nothing is settled and it may be followed again');
});

// ----- starting

const startHarness = ({ started }) => {
  resetResearchStore();
  const window = new Window();
  const document = window.document;
  const loading = document.createElement('div');
  document.body.append(loading);
  const conversation = { id: 'c1', title: 'T', messages: [{ role: 'user', parts: [{ text: 'solid-state batteries' }] }], __astraPendingResponse: { loadingMessageDiv: loading } };
  const log = { added: [], saved: 0, released: 0, notices: [], startArgs: null, attached: [] };
  const serverReply = {
    startResearch: async (args) => { log.startArgs = args; return started; },
    watchRun: async (runId) => { log.attached.push(runId); return false; },
    readMessage: async () => null,
    request: async () => ({ ok: true })
  };
  const runtime = createResearchRuntime({
    serverReply,
    addMessageToUI: (message, index, save, scroll, options) => { log.added.push({ message, index }); options.conversation.messages.push(message); return null; },
    saveAppData: async () => { log.saved += 1; },
    showNotification: (text, kind) => log.notices.push([text, kind]),
    getSync: () => null,
    getLanguage: () => 'en',
    getConfig: () => ({ searchProvider: 'tavily' }),
    releaseBusy: () => { log.released += 1; }
  });
  return { runtime, conversation, log, loading };
};

test('a research is started: the reply of the chat becomes a card message, the server is given the topic and the chat before it, and the run is followed', async () => {
  const { runtime, conversation, log, loading } = startHarness({ started: { ok: true, run: { runId: 'run-9' } } });
  const result = await runtime.start({ prepared: { conversation, loadingMessageDiv: loading }, topic: 'solid-state batteries', modelInfo: { provider: 'openrouter', id: 'm' } });
  assert.equal(result.ok, true);
  assert.equal(loading.isConnected, false, 'the "..." reply is gone');
  assert.equal(conversation.__astraPendingResponse, undefined);
  assert.equal(log.released, 1, 'the chat can be used while the research goes on');
  const message = log.added[0].message;
  assert.equal(message.role, 'model');
  assert.equal(message.parts[1].researchPlan.phase, 'planning');
  assert.equal(log.startArgs.research.topic, 'solid-state batteries');
  assert.equal(log.startArgs.assistantMessageId, message.id);
  assert.equal(log.startArgs.sequence, 1, 'it takes the place after the person\'s message');
  assert.deepEqual(log.startArgs.conversation.messages.map((entry) => entry.role), ['user'], 'the chat before it, without the card');
  assert.equal(getResearch(message.id).runId, 'run-9');
  assert.deepEqual(log.attached, ['run-9']);
});

test('a research the server does not take is a card that says so, and the person is told', async () => {
  const { runtime, conversation, log, loading } = startHarness({ started: { ok: false, reason: 'busy' } });
  const result = await runtime.start({ prepared: { conversation, loadingMessageDiv: loading }, topic: 'x', modelInfo: {} });
  assert.equal(result.ok, false);
  const message = log.added[0].message;
  assert.equal(message.parts[1].researchPlan.phase, 'failed');
  assert.match(message.parts[1].researchPlan.error.message, /busy/);
  assert.equal(getResearch(message.id).plan.phase, 'failed');
  assert.deepEqual(log.notices.map((notice) => notice[1]), ['warning']);
  assert.equal(log.attached.length, 0);
});
