import assert from 'node:assert/strict';
import test from 'node:test';

import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';
import { createStreamApiCall } from '../src/app/runtime/reply/stream-api-call.js';
import { PROJECT_INSTRUCTIONS_MAX, projectInstructionTextFor, projectOf, setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';
import { createNote } from '../src/app/runtime/memory-notes/notes.js';
import { createNotesMemory } from '../src/app/runtime/memory-store/notes-memory.js';

// The instructions of a project: every reply of a conversation in the project carries them, after the Noura and the memory and before the guidance for charts and files; a temporary chat,
// a conversation outside a project, a project without instructions and a project that is gone carry nothing.

const FOLDERS = [
  { id: 'f1', name: 'Translation', instructions: 'Answer in Spanish.' },
  { id: 'f2', name: 'Empty', instructions: '   ' },
  { id: 'f3', name: 'Gone', instructions: 'Never seen.', deletedAt: '2026-10-31T00:00:00.000Z' },
  { id: 'f4', name: 'Long\nname with "quotes"', instructions: 'x'.repeat(PROJECT_INSTRUCTIONS_MAX + 500) }
];

test('the instructions of the project the conversation is in, and nothing in the other cases', () => {
  setProjectFoldersReader(() => FOLDERS);
  assert.match(projectInstructionTextFor({ folderId: 'f1' }), /this chat is in the project "Translation"[\s\S]*Answer in Spanish\./);
  assert.equal(projectInstructionTextFor({}), '', 'not in a project');
  assert.equal(projectInstructionTextFor({ folderId: 'f2' }), '', 'no instructions');
  assert.equal(projectInstructionTextFor({ folderId: 'f3' }), '', 'a project that is gone');
  assert.equal(projectInstructionTextFor({ folderId: 'nope' }), '', 'a folder that does not exist');
  assert.equal(projectInstructionTextFor({ folderId: 'f1', retentionMode: 'ephemeral' }), '', 'a temporary chat is not in a project');
  assert.equal(projectOf({ folderId: 'f1', deletedAt: 'x' }), null);
  const long = projectInstructionTextFor({ folderId: 'f4' });
  assert.ok(long.length < PROJECT_INSTRUCTIONS_MAX + 400, 'cut to what is kept');
  assert.match(long, /the project "Long name with "quotes""/, 'the name is one line');
  setProjectFoldersReader(null);
  assert.equal(projectInstructionTextFor({ folderId: 'f1' }), '', 'a reader that is not given');
});

const ANSWER = { requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER };
const encoder = new TextEncoder();
const okStream = () => ({ ok: true, status: 200, statusText: 'OK', body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n')); controller.close(); } }) });

const harness = ({ conversation = {}, memory = null } = {}) => {
  const requests = [];
  const model = { id: 'm', apiId: 'm/x', name: 'M', provider: 'openrouter' };
  const resolved = { model: 'm', messages: [{ role: 'user', parts: [{ text: 'Hello' }] }], genConfig: { temperature: 0.4, topP: 0.8, maxTokens: 100 }, isWebSearchEnabled: false, astrasId: 'a1', ...conversation };
  const streamApiCall = createStreamApiCall({
    getActiveConversation: () => resolved,
    normalizeConversationModel: () => model,
    getModelApiId: (info) => info.apiId,
    getApiKeyForProvider: () => 'key',
    getDefaultGenConfig: () => ({ temperature: 0.7, topP: 0.95, maxTokens: null }),
    getConfig: () => ({ aiDefaultLanguage: 'en', isLearningMode: false, memoryEnabled1: false }),
    getAstras: () => [{ id: 'a1', name: 'Tutor', instructions: 'You are a patient tutor.' }],
    getPersonalMemories: () => [],
    getNotesMemory: () => memory,
    modelSupportsUploadedFile: () => true,
    modelSupportsVision: () => true,
    fetchImpl: async (url, options) => { requests.push({ url, options }); return okStream(); },
    warn() {}
  });
  return { streamApiCall, requests };
};

const systemOf = (requests) => JSON.parse(requests.at(-1).options.body).messages.find((message) => message.role === 'system')?.content || '';

test('a reply in a project carries its instructions after the Noura and the memory', async () => {
  setProjectFoldersReader(() => FOLDERS);
  try {
    const note = createNote({ id: 'n1', text: 'The user prefers concise answers', keywords: ['concise'], kind: 'preference', standing: true });
    const rows = [{ record_key: `note:${note.id}`, payload: note, version: 1, updated_at: note.updatedAt, deleted_at: null }];
    const data = new Map([['noureon.memoryNotes.v1.tester', JSON.stringify({ version: 1, rows })]]);
    const memory = createNotesMemory({ storage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }, logger: { warn() {} } });
    await memory.attach({ username: 'tester' });
    const inProject = harness({ conversation: { folderId: 'f1' }, memory });
    await inProject.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, ANSWER);
    const system = systemOf(inProject.requests);
    assert.match(system, /patient tutor/);
    assert.match(system, /concise answers/);
    assert.match(system, /Answer in Spanish\./);
    assert.ok(system.indexOf('patient tutor') < system.indexOf('Answer in Spanish.'), 'after the Noura');
    assert.ok(system.indexOf('concise answers') < system.indexOf('Answer in Spanish.'), 'after the memory');

    const outside = harness({ conversation: {}, memory });
    await outside.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, ANSWER);
    assert.doesNotMatch(systemOf(outside.requests), /Answer in Spanish/);
    const temporary = harness({ conversation: { folderId: 'f1', retentionMode: 'ephemeral', memoryAccessEnabled: false }, memory });
    await temporary.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, ANSWER);
    assert.doesNotMatch(systemOf(temporary.requests), /Answer in Spanish/);
  } finally { setProjectFoldersReader(null); }
});

test('a reply the server makes gets the instructions of the project in the text the page hands over', async () => {
  setProjectFoldersReader(() => FOLDERS);
  try {
    const page = harness({ conversation: { folderId: 'f1' } });
    const described = await page.streamApiCall([{ text: 'Hello' }], null, undefined, false, { describeOnly: true, ...ANSWER });
    assert.match(described.systemInstructionText, /Answer in Spanish\./);
    assert.equal(page.requests.length, 0, 'nothing is asked of a provider');
    const server = harness({ conversation: { folderId: 'f1' } });
    await server.streamApiCall([{ text: 'Hello' }], () => {}, undefined, false, { systemInstructionText: described.systemInstructionText, ...ANSWER });
    const system = systemOf(server.requests);
    assert.equal((system.match(/Answer in Spanish\./g) || []).length, 1, 'once, not added again by the server side of the page');
  } finally { setProjectFoldersReader(null); }
});
