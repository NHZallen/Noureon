import assert from 'node:assert/strict';
import test from 'node:test';

import { createPageCouncilMembers } from '../src/app/runtime/council/council-members-page.js';
import { startCouncilRun } from '../src/app/runtime/server-reply/server-council.js';
import { setProjectFoldersReader } from '../src/app/runtime/projects/project-instructions.js';

// The members of a council look into the files of the project the chat is in (docs/superpowers/specs/2026-11-01-project-files-multimodal-design.md, R9): nothing is sent with the message any more.

const FOLDER = { id: 'f1', name: 'Office', sources: [{ id: 's1', title: 'plan.md', text: 'The plan.' }] };
const fakeAccess = (made) => ({
  catalogText: 'CATALOG: plan.md',
  snapshot: () => ({ canView: true, vector: { provider: 'gemini' }, embeddingKey: 'g-key', entries: [{ id: 's1', name: 'plan.md', size: 9, text: 'The plan.' }] }),
  make: (language, onUsed, options) => {
    made.push(options?.canView);
    return { list: [], instruction: '', used: 0, tools: [{ name: 'search_project_files' }], handles: (name) => name === 'search_project_files', noteFor: () => null, run: async () => 'none' };
  }
});

test('each member gets a loader of the files of the project with its own say on looking at pictures, and the lifecycle is given the words that tell them the files', async () => {
  setProjectFoldersReader(() => [FOLDER]);
  try {
    const made = [];
    const seen = [];
    const createMembers = createPageCouncilMembers({
      streamApiCall: async (parts, onChunk, signal, force, options) => { seen.push(options.tools.map((tool) => tool.name)); onChunk('Answer.'); },
      support: { hasSearchKey: () => false },
      getConfig: () => ({ uiLanguage: 'en' }),
      modelSupportsToolCalling: () => true,
      modelUsesNativeWebSearch: () => false,
      modelSupportsVision: (model) => model.id === 'sees',
      loadProjectAccess: async () => ({ createProjectFilesAccess: async () => fakeAccess(made) })
    });
    const members = await createMembers({ id: 'c', folderId: 'f1' }, [{ text: 'Hello' }]);
    assert.equal(members.projectFilesCatalog, 'CATALOG: plan.md');
    await members.answer({ modelInfo: { id: 'sees' }, parts: [{ text: 'Hello' }] });
    await members.answer({ modelInfo: { id: 'blind' }, parts: [{ text: 'Hello' }] });
    assert.deepEqual(made, [true, false]);
    assert.deepEqual(seen, [['search_project_files'], ['search_project_files']]);
    // A chat outside a project has none.
    const outside = await createMembers({ id: 'd' }, [{ text: 'Hello' }]);
    assert.equal(outside.projectFilesCatalog, '');
  } finally { setProjectFoldersReader(null); }
});

test('the council handed to the server carries the files of the project (without a say on pictures: the server decides for each member), the key of the vectors apart, and the members are told the files', async () => {
  const sent = [];
  const model = (id) => ({ provider: 'openrouter', id, name: id });
  const result = await startCouncilRun({
    getApiKeyForProvider: () => 'key', describeRequest: async (parts, options) => ({ systemInstructionText: `SYS-${options.requestPurpose}` }), searchKeyFor: () => null, withCloudFiles: async (history) => history,
    request: async (method, path, { body }) => { sent.push(JSON.parse(body)); return { ok: true, data: { runId: 'r1' } }; }, flushSync: async () => {}, warn() {}, clientVersion: '19.1.0', createRun: (run) => run, reasons: { tooLarge: 'too-large' }, protocol: 4, maxChars: 5_000_000,
    loadProjectAccess: async () => ({ createProjectFilesAccess: async () => fakeAccess([]) })
  }, {
    conversation: { id: 'c', folderId: 'f1', messages: [] }, council: { mode: 'consensus' }, participants: [model('a'), model('b')], synthesizer: model('s'), userParts: [{ text: 'Hello' }], assistantMessageId: 'm1'
  });
  assert.equal(result.ok, true);
  const spec = sent[0];
  assert.deepEqual(spec.tools.projectFiles, { vector: { provider: 'gemini' }, entries: [{ id: 's1', name: 'plan.md', size: 9, text: 'The plan.' }] });
  assert.equal(spec.secrets.embeddingKey, 'g-key');
  assert.match(spec.request.systemInstructions.participant, /CATALOG: plan\.md/);
  assert.match(spec.request.systemInstructions.deliberation, /CATALOG: plan\.md/);
  assert.doesNotMatch(spec.request.systemInstructions.synthesis, /CATALOG/);
  // No project, nothing added.
  sent.length = 0;
  await startCouncilRun({
    getApiKeyForProvider: () => 'key', describeRequest: async () => ({ systemInstructionText: 'SYS' }), searchKeyFor: () => null, withCloudFiles: async (history) => history,
    request: async (method, path, { body }) => { sent.push(JSON.parse(body)); return { ok: true, data: { runId: 'r2' } }; }, flushSync: async () => {}, warn() {}, clientVersion: '19.1.0', createRun: (run) => run, reasons: { tooLarge: 'too-large' }, protocol: 4, maxChars: 5_000_000
  }, { conversation: { id: 'c', messages: [] }, council: { mode: 'consensus' }, participants: [model('a'), model('b')], synthesizer: model('s'), userParts: [{ text: 'Hello' }], assistantMessageId: 'm2' });
  assert.equal('projectFiles' in sent[0].tools, false);
  assert.equal('embeddingKey' in sent[0].secrets, false);
});
