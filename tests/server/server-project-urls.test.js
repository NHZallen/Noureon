import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';

// The model on the server reads a web address that is a source of a project, with the key of the search source of this reply (src/data/project-source-url.js).

const USER = '22222222-2222-4222-8222-222222222222';
const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
const URL_ENTRY = { id: 'u1', name: 'example.com/guide', size: 0, url: 'https://example.com/guide' };
const spec = (entries, secrets = { providerKey: 'sk-provider-secret-value', searchKey: 'tvly-key' }) => ({
  protocol: PROTOCOL_VERSION, clientVersion: '19.2.1', conversationId: ID_A, assistantMessageId: ID_B, sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'What does the guide say about the launch?' }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, projectFiles: { entries } },
  secrets
});

test('a request may name web addresses among the files of a project; an address that is not http or https is refused, and a kept address is the same one', () => {
  const ok = validateRunSpec(spec([URL_ENTRY]));
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.deepEqual(ok.spec.tools.projectFiles.entries, [URL_ENTRY]);
  assert.equal(validateRunSpec(spec([{ ...URL_ENTRY, url: 'javascript:alert(1)' }])).ok, false);
  assert.equal(validateRunSpec(spec([{ ...URL_ENTRY, url: 'https://user:pw@example.com/' }])).ok, false);
  assert.equal(validateRunSpec(spec([{ ...URL_ENTRY, url: 'example.com/no-scheme' }])).ok, false, 'the page keeps the normal form: the server does not guess');
});

async function run({ secrets, answer }) {
  const seen = { extract: [], provider: [] };
  let round = 0;
  const result = await executeReply({
    spec: spec([URL_ENTRY], secrets), secrets, userId: USER, files: null,
    fetchImpl: async (url, options) => {
      if (String(url).includes('tavily.com/extract')) {
        seen.extract.push({ authorization: options.headers.Authorization, body: JSON.parse(options.body) });
        return answer(url);
      }
      seen.provider.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(sse(round === 1 ? toolCall('c1', 'read_project_file', { file: 'example.com/guide' }) : content('Done.')));
    }
  });
  return { result, seen };
}
const toolAnswer = (requests) => requests.at(-1).messages.filter((entry) => entry.role === 'tool').map((entry) => entry.content).join('\n');

test('the model asks for the page and the server reads it with the key of the reply: the address goes to the reading service, the page text comes back to the model', async () => {
  const { seen } = await run({ secrets: { providerKey: 'sk-provider-secret-value', searchKey: 'tvly-key' }, answer: () => Response.json({ results: [{ url: 'https://example.com/guide', raw_content: 'The guide says the launch is in March.' }] }) });
  assert.equal(seen.extract.length, 1);
  assert.equal(seen.extract[0].authorization, 'Bearer tvly-key');
  assert.deepEqual(seen.extract[0].body.urls, ['https://example.com/guide']);
  assert.match(toolAnswer(seen.provider), /launch is in March/);
  assert.match(toolAnswer(seen.provider), /"url":"https:\/\/example\.com\/guide"/);
});

test('without a key of a reading service the model is told it cannot read the page, and nothing is sent', async () => {
  const { seen } = await run({ secrets: { providerKey: 'sk-provider-secret-value' }, answer: () => { throw new Error('must not be asked'); } });
  assert.equal(seen.extract.length, 0);
  assert.match(toolAnswer(seen.provider), /no key of a reading service/);
});

test('a page the service cannot read is told to the model as one that could not be read now', async () => {
  const { seen } = await run({ secrets: { providerKey: 'sk-provider-secret-value', searchKey: 'tvly-key' }, answer: () => Response.json({ results: [], failed_results: [{ url: 'https://example.com/guide' }] }) });
  assert.match(toolAnswer(seen.provider), /could not be read now/);
});
