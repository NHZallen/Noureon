import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryIndex, cutIntoPieces, piecesOf } from '../../src/app/runtime/memory-notes/history-index.js';
import { createPageHistory } from '../../src/app/runtime/memory-store/page-history.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createPageMemoryTools } from '../../src/app/runtime/memory-store/page-memory-loader.js';
import { createStreamApiCall } from '../../src/app/runtime/reply/stream-api-call.js';

const conv = (id, turns, extra = {}) => ({ id, title: id, createdAt: '2026-09-01T00:00:00.000Z', lastUpdatedAt: '2026-09-01T00:00:00.000Z', messages: turns.map(([role, text], index) => ({ role, parts: [{ text }], createdAt: `2026-09-01T00:0${index}:00.000Z` })), ...extra });

const OLD = conv('old', [['user', 'My Shiba Inu named Mochi keeps chewing the sofa, how do I stop the chewing?'], ['model', 'Give Mochi chew toys and redirect the chewing.']]);
const OTHER = conv('other', [['user', 'Plan my trip to Kyoto in April with temples and tea houses'], ['model', 'Day one: Fushimi Inari.']]);

test('a long text is cut into pieces of at most 800 characters, at a sentence end when there is one', () => {
  const text = `${'First sentence is here. '.repeat(60)}`;
  const pieces = cutIntoPieces(text);
  assert.ok(pieces.length >= 2);
  assert.ok(pieces.every((piece) => piece.length <= 800));
  assert.ok(pieces.slice(0, -1).every((piece) => piece.endsWith('.')), 'cut at the end of a sentence');
  assert.deepEqual(cutIntoPieces('   '), []);
  assert.deepEqual(piecesOf(OLD).map((piece) => piece.role), ['user', 'model']);
});

test('the index finds a past conversation by what is asked, one piece for each, and leaves out the one being written', () => {
  const index = createHistoryIndex();
  index.update([OLD, OTHER]);
  const found = index.search('how to stop my Shiba Inu Mochi chewing the sofa');
  assert.equal(found[0].conversationId, 'old');
  assert.ok(found[0].norm >= 0.25);
  assert.equal(index.search('how to stop my Shiba Inu Mochi chewing the sofa', { excludeConversationId: 'old' }).length, 0);
  assert.deepEqual(index.search('what is the capital of France'), [], 'a question about nothing in the past finds nothing');
});

test('a temporary conversation, a deleted one and one that was taken away are not searched; only what changed is cut again', () => {
  const index = createHistoryIndex();
  const temporary = { ...OLD, id: 'temp', isTemporary: true };
  const ephemeral = { ...OLD, id: 'eph', retentionMode: 'ephemeral' };
  const deleted = { ...OLD, id: 'del', deletedAt: '2026-10-01T00:00:00.000Z' };
  assert.equal(index.update([temporary, ephemeral, deleted, OLD, OTHER]), 2);
  assert.equal(index.search('Shiba Inu Mochi chewing the sofa').every((piece) => piece.conversationId === 'old'), true);
  const before = index.pieceCount;
  index.update([OLD, OTHER]);
  assert.equal(index.pieceCount, before);
  index.update([OTHER]);
  assert.equal(index.search('Shiba Inu Mochi chewing the sofa').length, 0, 'a conversation that is gone leaves the index');
  const grown = conv('other', [['user', 'Plan my trip to Kyoto in April with temples and tea houses'], ['model', 'ok'], ['user', 'Also add a day trip to Nara with the deer park']]);
  index.update([grown]);
  assert.equal(index.search('day trip to Nara deer park')[0]?.conversationId, 'other');
});

test('the slip holds a piece of a past conversation even when there are no notes, and the sources are told', async () => {
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: [] })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => [OLD, OTHER] });
  memory.setHistorySearch((question, options) => history.search(question, options));
  const asked = memory.contextFor({ question: 'how to stop my Shiba Inu Mochi chewing the sofa', excludeConversationId: 'now' });
  assert.match(asked.slipText, /Earlier conversation/);
  assert.match(asked.slipText, /chewing the sofa/);
  assert.deepEqual(asked.historyIds, ['old']);
  assert.equal(memory.contextFor({ question: 'translate this into French', excludeConversationId: 'now' }).slipText, '');
  // A search that fails never stops the reply.
  memory.setHistorySearch(() => { throw new Error('broken'); });
  assert.equal(memory.contextFor({ question: 'anything at all here' }).slipText, '');
});

test('a request reports the past conversations the slip drew on, for the references under the reply', async () => {
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: [] })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => [OLD] });
  memory.setHistorySearch((question, options) => history.search(question, options));
  const requests = [];
  const model = { id: 'm', apiId: 'm/x', name: 'M', provider: 'openrouter' };
  const conversation = { id: 'now', model: 'm', messages: [{ role: 'user', parts: [{ text: 'q' }] }], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: 100 } };
  const encoder = new TextEncoder();
  const call = createStreamApiCall({
    getActiveConversation: () => conversation, normalizeConversationModel: () => model, getModelApiId: (info) => info.apiId, getApiKeyForProvider: () => 'key',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }), getConfig: () => ({ aiDefaultLanguage: 'en' }),
    getAstras: () => [], getPersonalMemories: () => [], getNotesMemory: () => memory, modelSupportsUploadedFile: () => true, modelSupportsVision: () => true,
    fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, status: 200, statusText: 'OK', body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n')); controller.close(); } }) }; },
    warn() {}
  });
  const sources = [];
  await call([{ text: 'how to stop my Shiba Inu Mochi chewing the sofa' }], () => {}, undefined, false, { onMemoryContextResolved: (context) => sources.push(...context.historyResults.map((result) => result.conversationId)) });
  assert.deepEqual(sources, ['old']);
  assert.match(JSON.stringify(requests[0].messages), /Earlier conversation/);
});

test('search_memory takes a scope on this page and gives pieces of past conversations; the one being written is left out', async () => {
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows: [] })]]);
  const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  const history = createPageHistory({ getConversations: () => [OLD, OTHER] });
  const tools = await createPageMemoryTools({ getConfig: () => ({}), getMemory: () => memory, getHistory: () => history, conversation: { id: 'other', messages: [] } });
  const loader = tools.make('en');
  const answer = JSON.parse(await loader.run({ name: 'search_memory', args: { query: 'Shiba chewing sofa', scope: 'history' } }));
  assert.equal(answer.conversations[0].conversationId, 'old');
  assert.match(await loader.run({ name: 'search_memory', args: { query: 'trip to Kyoto temples', scope: 'history' } }), /Nothing in the memory matches/, 'the conversation being written is not looked in');
  assert.deepEqual(loader.tools.map((tool) => tool.name).sort(), ['memory_write', 'search_memory'], 'with a history to look in the search is offered even with no notes');
});
