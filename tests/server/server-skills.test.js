import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { createServerSkills } from '../../server/skills.js';
import { OFFICIAL_SKILL_CATALOG } from '../../src/data/skill-catalog.js';

const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';
const sse = (...objects) => `${objects.map((object) => `data: ${JSON.stringify(object)}\n\n`).join('')}data: [DONE]\n\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const content = (text) => ({ choices: [{ delta: { content: text } }] });
const toolCall = (id, name, args) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });

const goodSpec = (tools = {}) => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '17.17.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'test/model', info: { name: 'Test', provider: 'openrouter', id: 'openrouter-test', apiId: 'test/model' } },
  request: { history: [], currentMessage: { parts: [{ text: 'tidy these notes' }] }, systemInstruction: 'Be brief.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, ...tools },
  secrets: { providerKey: 'sk-provider-secret-value' }
});

test('the skills a model may load are in the request as names and descriptions, checked, and kept as the shared list would show them', () => {
  const ok = validateRunSpec(goodSpec({ skills: [{ name: 'meeting-notes', description: 'Turns a transcript into decisions.' }, { name: 'meeting-notes', description: 'again' }, { name: 'write-up', description: `${'w '.repeat(400)}` }] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.spec.tools.skills.map((entry) => entry.name), ['meeting-notes', 'write-up'], 'each once');
  assert.ok(ok.spec.tools.skills[1].description.length <= 300, 'descriptions are cut as the page cuts them');
  assert.equal('skills' in validateRunSpec(goodSpec()).spec.tools, false, 'nothing when there are none');
  for (const bad of [
    'not a list',
    [{ name: 'Bad Name', description: 'd' }],
    [{ name: 'fine-one' }],
    [{ name: 'fine-one', description: 'x'.repeat(1025) }],
    Array.from({ length: 31 }, (_, index) => ({ name: `s${index}`, description: 'd' })),
    [null]
  ]) {
    const result = validateRunSpec(goodSpec({ skills: bad }));
    assert.equal(result.ok, false, JSON.stringify(bad).slice(0, 60));
    assert.ok(result.errors.some((error) => /tools\.skills/.test(JSON.stringify(error))));
  }
});

test('the server reads a skill\'s text: an official one from the app, the person\'s own from their rows only', async () => {
  OFFICIAL_SKILL_CATALOG.push({ name: 'official-one', description: 'D', body: 'Official text.', version: '1' });
  try {
    const asked = [];
    const db = { select: async (table, options) => { asked.push({ table, ...options }); return options.filters.user_id === 'eq.u1' && options.filters.name === 'eq.mine-1' ? [{ name: 'mine-1', body: 'My text.' }] : []; } };
    const skills = createServerSkills({ db });
    assert.deepEqual(await skills.body('u1', 'official-one'), { name: 'official-one', body: 'Official text.' });
    assert.equal(asked.length, 0, 'an official skill needs no row');
    assert.deepEqual(await skills.body('u1', 'mine-1'), { name: 'mine-1', body: 'My text.' });
    assert.deepEqual(asked[0].filters, { user_id: 'eq.u1', name: 'eq.mine-1' });
    assert.equal(asked[0].table, 'user_skills');
    assert.equal(await skills.body('u2', 'mine-1'), null, 'another person\'s skill is not read');
    assert.equal(await skills.body('u1', 'Bad Name'), null);
    assert.equal(await skills.body('', 'mine-1'), null);
  } finally {
    OFFICIAL_SKILL_CATALOG.length = 0;
  }
});

test('a plain reply on the server: the model is told of the skills, loads one, and answers with its text; the pages are told of the row', async () => {
  const requests = [];
  const live = [];
  let round = 0;
  const result = await executeReply({
    spec: goodSpec({ skills: [{ name: 'meeting-notes', description: 'Turns a transcript into decisions.' }] }),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: 'u1',
    skills: { body: async (userId, name) => (userId === 'u1' && name === 'meeting-notes' ? { name, body: 'List the decisions first.' } : null) },
    onLive: (event) => live.push(event),
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      return streamResponse(round === 1 ? sse(toolCall('call_1', 'load_skill', { name: 'meeting-notes' })) : sse(content('Decisions: none.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.equal(result.parts[0].text, 'Decisions: none.');
  assert.equal(result.toolCalls, 1);
  assert.equal(requests.length, 2);
  assert.ok(requests[0].tools.some((tool) => tool.function?.name === 'load_skill' || tool.name === 'load_skill'), 'the tool is offered');
  assert.match(JSON.stringify(requests[0].messages), /- meeting-notes: Turns a transcript into decisions\./);
  assert.match(JSON.stringify(requests[1].messages), /List the decisions first\./, 'the second request carries the skill\'s text');
  const row = live.find((event) => event.ev?.type === 'skill');
  assert.equal(row.ev.label, 'Loading skill: meeting-notes');
  assert.ok(Number.isFinite(row.ev.t));
});

test('without the server\'s reader, with Gemini\'s own search, or with no skills, the reply is one plain request', async () => {
  const run = async ({ spec, skills }) => {
    const requests = [];
    await executeReply({ spec, secrets: { providerKey: 'sk-provider-secret-value' }, userId: 'u1', skills, fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); return streamResponse(sse(content('Hello'))); } });
    return requests;
  };
  const withSkills = goodSpec({ skills: [{ name: 'a1', description: 'd' }] });
  const reader = { body: async () => ({ name: 'a1', body: 'x' }) };
  const none = await run({ spec: withSkills, skills: null });
  assert.equal(none.length, 1);
  assert.equal(none[0].tools, undefined, 'no tool without the reader');
  const bare = await run({ spec: goodSpec(), skills: reader });
  assert.equal(bare[0].tools, undefined);
  const one = await run({ spec: withSkills, skills: reader });
  assert.ok(one[0].tools?.length, 'the tool when the reader is there');
});
