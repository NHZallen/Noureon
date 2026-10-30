import assert from 'node:assert/strict';
import test from 'node:test';

import { createStreamApiCall } from '../../src/app/runtime/reply/stream-api-call.js';
import { createNotesMemory } from '../../src/app/runtime/memory-store/notes-memory.js';
import { createNote } from '../../src/app/runtime/memory-notes/notes.js';

const encoder = new TextEncoder();
const okStream = () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    }
  })
});

const noteRow = (note) => ({ record_key: `note:${note.id}`, payload: note, version: 1, updated_at: note.updatedAt, deleted_at: null });
const NOTES = [
  createNote({ id: 'n-concise', text: 'The user prefers concise answers', keywords: ['concise', 'short'], kind: 'preference', standing: true }),
  createNote({ id: 'n-dog', text: 'The user has a Shiba Inu dog named Mochi', keywords: ['shiba', 'mochi', 'dog'], kind: 'fact' })
];

const makeStorage = (rows) => {
  const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, data };
};

const loadedMemory = async ({ rows = NOTES.map(noteRow), settings } = {}) => {
  const all = settings ? [...rows, { record_key: 'meta:settings', payload: settings, version: 1, updated_at: '2026-10-30T00:00:00.000Z', deleted_at: null }] : rows;
  const storage = makeStorage(all);
  const memory = createNotesMemory({ storage, logger: { warn() {} } });
  await memory.attach({ username: 'tester' });
  return { memory, storage };
};

const harness = ({ config = {}, memory = null, conversation = {} } = {}) => {
  const requests = [];
  const model = { id: 'm', apiId: 'm/x', name: 'M', provider: 'openrouter' };
  const resolved = { model: 'm', messages: [{ role: 'user', parts: [{ text: 'Hello' }] }], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: 100 }, isWebSearchEnabled: false, ...conversation };
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => resolved,
    normalizeConversationModel: () => model,
    getModelApiId: (info) => info.apiId,
    getApiKeyForProvider: () => 'key',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'en', isLearningMode: false, memoryEnabled1: false, ...config }),
    getAstras: () => [],
    getPersonalMemories: () => [{ enabled: true, content: 'Legacy memory line' }],
    getNotesMemory: () => memory,
    modelSupportsUploadedFile: () => true,
    modelSupportsVision: () => true,
    fetchImpl: async (url, options) => { requests.push({ url, options }); return okStream(); },
    warn() {}
  });
  return { streamApiCall, requests, conversation: resolved };
};

const body = (requests) => JSON.parse(requests[0].options.body);
const systemOf = (requests) => body(requests).messages.find((message) => message.role === 'system')?.content || '';
const lastUserText = (requests) => {
  const last = body(requests).messages.filter((message) => message.role === 'user').pop();
  return typeof last.content === 'string' ? last.content : last.content.map((part) => part.text || '').join('\n');
};

const QUESTION = 'How should I train my Shiba Inu dog Mochi?';

test('the notes: the first page goes in the system instruction and the slip after the message, the old memory is not used', async () => {
  const { memory } = await loadedMemory();
  const { streamApiCall, requests, conversation } = harness({ config: { memorySystem: 'notes' }, memory });
  await streamApiCall([{ text: QUESTION }], () => {});
  const system = systemOf(requests);
  assert.match(system, /Standing preferences/);
  assert.match(system, /The user prefers concise answers/);
  assert.doesNotMatch(system, /Shiba/, 'a note that is not standing stays out of the system instruction');
  assert.doesNotMatch(system, /Legacy memory line/);
  const sent = lastUserText(requests);
  assert.match(sent, /<memory-context>/);
  assert.match(sent, /Shiba Inu dog named Mochi/);
  assert.ok(sent.indexOf(QUESTION) < sent.indexOf('<memory-context>'), 'the slip comes after what the person wrote');
  assert.doesNotMatch(JSON.stringify(conversation.messages), /memory-context/, 'the saved message never carries the slip');
});

test('the notes: a question that bears on no note brings no slip, the first page is still there', async () => {
  const { memory } = await loadedMemory();
  const { streamApiCall, requests } = harness({ config: { memorySystem: 'notes' }, memory });
  await streamApiCall([{ text: 'What is the capital of France?' }], () => {});
  assert.doesNotMatch(lastUserText(requests), /memory-context/);
  assert.match(systemOf(requests), /concise answers/);
});

test('the old memory stays as it was when the notes are not chosen', async () => {
  const { memory } = await loadedMemory();
  const { streamApiCall, requests } = harness({ config: { memorySystem: 'classic', memoryEnabled1: true }, memory });
  await streamApiCall([{ text: QUESTION }], () => {});
  assert.match(systemOf(requests), /Legacy memory line/);
  assert.doesNotMatch(systemOf(requests), /Standing preferences/);
  assert.doesNotMatch(lastUserText(requests), /memory-context/);
});

test('a chat that may not use memory gets nothing from the notes', async () => {
  const { memory } = await loadedMemory();
  const { streamApiCall, requests } = harness({ config: { memorySystem: 'notes' }, memory, conversation: { retentionMode: 'ephemeral', memoryAccessEnabled: false } });
  await streamApiCall([{ text: QUESTION }], () => {});
  assert.doesNotMatch(systemOf(requests), /concise answers/);
  assert.doesNotMatch(lastUserText(requests), /memory-context/);
});

test('switching the use of memory off gives nothing, and a memory that did not load gives nothing', async () => {
  const off = await loadedMemory({ settings: { use: false } });
  const first = harness({ config: { memorySystem: 'notes' }, memory: off.memory });
  await first.streamApiCall([{ text: QUESTION }], () => {});
  assert.doesNotMatch(systemOf(first.requests), /concise answers/);
  assert.doesNotMatch(lastUserText(first.requests), /memory-context/);

  const broken = createNotesMemory({ storage: { getItem() { throw new Error('storage is blocked'); }, setItem() {} }, logger: { warn() {} } });
  await assert.doesNotReject(broken.attach({ username: 'tester' }));
  assert.equal(broken.isReady(), false);
  const second = harness({ config: { memorySystem: 'notes' }, memory: broken });
  await second.streamApiCall([{ text: QUESTION }], () => {});
  assert.doesNotMatch(lastUserText(second.requests), /memory-context/);
});

test('a reply the server makes: describeOnly hands over the slip, and the server puts it after the message', async () => {
  const { memory } = await loadedMemory();
  const page = harness({ config: { memorySystem: 'notes' }, memory });
  const described = await page.streamApiCall([{ text: QUESTION }], null, undefined, false, { describeOnly: true, markMemoryUsed: true });
  assert.match(described.systemInstructionText, /concise answers/);
  assert.match(described.memorySlipText, /Mochi/);
  assert.equal(page.requests.length, 0, 'nothing is asked of a provider');

  const server = harness({ memory: null });
  await server.streamApiCall([{ text: QUESTION }], () => {}, undefined, false, { systemInstructionText: described.systemInstructionText, memorySlipText: described.memorySlipText });
  assert.match(systemOf(server.requests), /concise answers/);
  assert.match(lastUserText(server.requests), /<memory-context>[\s\S]*Mochi/);
});

test('the use of the notes of a slip is recorded once, for the reply that is made', async () => {
  const { memory } = await loadedMemory();
  const { streamApiCall } = harness({ config: { memorySystem: 'notes' }, memory });
  await streamApiCall([{ text: QUESTION }], () => {}, undefined, false, { toolTurns: [] });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const dog = memory.getStore().getNotes().find((note) => note.id === 'n-dog');
  assert.equal(dog.recallCount, 1);
  assert.ok(dog.lastUsedAt);

  // The later rounds of the same reply (after a tool) and the work of describing do not count again.
  await streamApiCall([{ text: QUESTION }], () => {}, undefined, false, { toolTurns: [{ calls: [] }] });
  await streamApiCall([{ text: QUESTION }], null, undefined, false, { describeOnly: true });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(memory.getStore().getNotes().find((note) => note.id === 'n-dog').recallCount, 1);
});

test('the slip is also built for a reply with a tool round, and carried by every round', async () => {
  const { memory } = await loadedMemory();
  const { streamApiCall, requests } = harness({ config: { memorySystem: 'notes' }, memory });
  await streamApiCall([{ text: QUESTION }], () => {}, undefined, false, { toolTurns: [{ calls: [] }] });
  assert.match(lastUserText(requests), /<memory-context>/);
});
