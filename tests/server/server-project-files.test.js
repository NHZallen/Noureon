import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { clearProjectFileTextCache, createProjectFileTextReader } from '../../server/project-file-text.js';

// The files of a project on the server (docs/superpowers/specs/2026-10-31-projects-design.md, §16): the model of a reply made by the server looks into them by itself, with their text from the
// request or read from the person's cloud storage, so it goes on when the page is closed.

const USER = '22222222-2222-4222-8222-222222222222';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const HASH = 'a'.repeat(64);
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

const goodSpec = (projectFiles) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '19.1.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'What is the Taipei budget?' }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, ...(projectFiles ? { projectFiles } : {}) },
  secrets: { providerKey: 'sk-provider-secret-value' }
});
const ENTRIES = {
  entries: [
    { id: 's1', name: 'notes.md', size: 60, text: 'The Taipei budget is 480,000 dollars. Hiring is frozen.' },
    { id: 's2', name: 'plan.txt', size: 40, file: { hash: HASH, mimeType: 'text/plain', name: 'plan.txt' } }
  ]
};

test('the request may carry the files of the project: their names with a text or the hash of the file; anything else is refused', () => {
  const ok = validateRunSpec(goodSpec(ENTRIES));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.spec.tools.projectFiles.entries.map((entry) => [entry.id, 'text' in entry, entry.file?.hash]), [['s1', true, undefined], ['s2', false, HASH]]);
  assert.equal('projectFiles' in validateRunSpec(goodSpec(null)).spec.tools, false);
  for (const bad of [
    'files',
    { entries: [] },
    { entries: Array.from({ length: 21 }, (_, n) => ({ id: `s${n}`, name: 'a', size: 1, text: 'x' })) },
    { entries: [{ id: 's', name: 'a', size: 1 }] },
    { entries: [{ id: 's', name: 'a', size: 1, file: { hash: 'not-a-hash' } }] },
    { entries: [{ id: 's', name: 'a', size: 1, text: 'x'.repeat(100_001) }] },
    { entries: Array.from({ length: 5 }, (_, n) => ({ id: `s${n}`, name: 'a', size: 1, text: 'x'.repeat(90_000) })) }
  ]) {
    const result = validateRunSpec(goodSpec(bad));
    assert.equal(result.ok, false, JSON.stringify(bad).slice(0, 60));
    assert.ok(result.errors.some((error) => /tools\.projectFiles/.test(JSON.stringify(error))));
  }
});

test('the model of a reply on the server searches the files: the text that came, and a file read from the cloud storage of the person', async () => {
  clearProjectFileTextCache();
  const loads = [];
  const files = { load: async ({ userId, marker }) => { loads.push([userId, marker.__astraCloudAsset.path]); return new TextEncoder().encode('The plan: open the Hsinchu office in March.'); } };
  const requests = [];
  let round = 0;
  const result = await executeReply({
    spec: goodSpec(ENTRIES),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    files,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('c1', 'search_project_files', { query: 'Taipei budget' })));
      if (round === 2) return streamResponse(sse(toolCall('c2', 'search_project_files', { query: 'Hsinchu office March' })));
      return streamResponse(sse(content('480,000 dollars.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.ok(requests[0].tools.some((tool) => (tool.function?.name || tool.name) === 'search_project_files'));
  assert.ok(requests[0].tools.some((tool) => (tool.function?.name || tool.name) === 'read_project_file'));
  const toolAnswers = (index) => requests[index].messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n');
  assert.match(toolAnswers(1), /480,000 dollars/);
  assert.match(toolAnswers(2), /Hsinchu office/);
  assert.deepEqual(loads, [[USER, `${USER}/${HASH}`]], 'the file of the person is read once, from the folder of the person');
});

test('a file that cannot be read says so and the reply goes on; one that is not the person\'s is never read', async () => {
  clearProjectFileTextCache();
  const read = createProjectFileTextReader({ files: { load: async () => { throw new Error('gone'); } }, userId: USER });
  await assert.rejects(read({ file: { hash: HASH, mimeType: 'text/plain', name: 'x.txt' } }), /gone/);
  assert.equal(await read({ text: 'inline' }), 'inline');
  await assert.rejects(createProjectFileTextReader({ files: null, userId: USER })({ file: { hash: HASH } }), /cannot be read/);
  const paths = [];
  const reader = createProjectFileTextReader({ files: { load: async ({ userId, marker }) => { paths.push(marker.__astraCloudAsset.path); return new TextEncoder().encode('x'); } }, userId: USER });
  await reader({ file: { hash: HASH, mimeType: 'text/plain', name: 'x.txt' } });
  assert.deepEqual(paths, [`${USER}/${HASH}`], 'the path is made from the person and the hash only');
});
