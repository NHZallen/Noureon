import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { executeReply } from '../../server/executor.js';
import { validateRunSpec } from '../../server/run-spec.js';
import { createServerSkills } from '../../server/skills.js';
import { OFFICIAL_SKILL_CATALOG } from '../../src/data/skill-catalog.js';
import { createSkillBundleStore } from '../../server/skill-bundles.js';
import { SKILL_BUNDLE_LIMITS, skillBundlePath } from '../../src/data/skill-bundle.js';
import JSZip from 'jszip';

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

// ----- skills with files (docs/superpowers/specs/2026-10-09-skills-design.md, §14)
const USER = '123e4567-e89b-12d3-a456-426614174099';
const SKILL_MD = '---\nname: sales-report\ndescription: Builds the sales report.\n---\n\nRun the script, then read the format.\n';
const packBytes = async (files = { 'references/format.md': '# Format\nUse bullets.\n', 'scripts/summary.py': 'print(1)\n', 'assets/logo.png': new Uint8Array([0x89, 0xff, 0xfe]) }) => {
  const zip = new JSZip();
  zip.file('SKILL.md', SKILL_MD);
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};
const ROW = { name: 'sales-report', body: 'Run the script, then read the format.', files: [{ path: 'references/format.md', size: 22, kind: 'text' }, { path: 'scripts/summary.py', size: 9, kind: 'script' }, { path: 'assets/logo.png', size: 3, kind: 'binary' }] };

test('the request may say which skills have files and which were given whole, and nothing else about them', () => {
  const ok = validateRunSpec(goodSpec({ skills: [{ name: 'a1', description: 'd', files: true }, { name: 'b2', description: 'd', given: true, files: true }, { name: 'c3', description: 'd', files: false }] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.spec.tools.skills, [{ name: 'a1', description: 'd', files: true }, { name: 'b2', description: 'd', files: true, given: true }, { name: 'c3', description: 'd' }]);
  for (const bad of [{ files: 'yes' }, { given: 1 }, { files: {} }]) {
    const result = validateRunSpec(goodSpec({ skills: [{ name: 'a1', description: 'd', ...bad }] }));
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.errors.some((error) => /tools\.skills\[0\]/.test(JSON.stringify(error))));
  }
});

test('the server gives the list of files of a skill with the text, and reads a text file from the stored zip, checking the zip again', async () => {
  const downloads = [];
  const bytes = await packBytes();
  const bundles = { download: async (userId, name) => { downloads.push([userId, name]); return userId === USER && name === 'sales-report' ? bytes : null; } };
  const db = { select: async (table, options) => (options.filters.user_id === `eq.${USER}` && options.filters.name === 'eq.sales-report' ? [ROW] : (options.filters.name === 'eq.plain' ? [{ name: 'plain', body: 'Plain.', files: [] }] : [])) };
  let clock = 0;
  const skills = createServerSkills({ db, bundles, now: () => clock });
  const found = await skills.body(USER, 'sales-report');
  assert.deepEqual(found.files.map((file) => [file.path, file.kind]), [['references/format.md', 'text'], ['scripts/summary.py', 'script'], ['assets/logo.png', 'binary']]);
  assert.equal((await skills.body(USER, 'plain')).files, undefined, 'no list for a skill without files');
  assert.deepEqual(await skills.readFile(USER, 'sales-report', 'references/format.md'), { ok: true, text: '# Format\nUse bullets.\n', cut: false });
  assert.deepEqual(await skills.readFile(USER, 'sales-report', 'scripts/summary.py'), { ok: true, text: 'print(1)\n', cut: false });
  assert.equal(downloads.length, 1, 'the zip is opened once for a while');
  assert.deepEqual(await skills.readFile(USER, 'sales-report', 'assets/logo.png'), { ok: false, reason: 'binary' });
  assert.deepEqual(await skills.readFile(USER, 'sales-report', 'not/there.md'), { ok: false, reason: 'not_found' });
  assert.deepEqual(await skills.readFile(USER, 'Bad Name', 'a.md'), { ok: false, reason: 'not_found' });
  assert.deepEqual(await skills.readFile('', 'sales-report', 'references/format.md'), { ok: false, reason: 'not_found' });
  assert.deepEqual(await skills.readFile('other-user', 'sales-report', 'references/format.md'), { ok: false, reason: 'failed' }, 'another person has no zip of that name');
  clock = 61_000;
  await skills.readFile(USER, 'sales-report', 'references/format.md');
  assert.equal(downloads.filter(([userId]) => userId === USER).length, 2, 'asked again after it was let go');
  // No store of zips, or a stored file that is not a valid skill pack, is "failed", never a crash and never the file.
  assert.deepEqual(await createServerSkills({ db }).readFile(USER, 'sales-report', 'references/format.md'), { ok: false, reason: 'failed' });
  const broken = createServerSkills({ db, bundles: { download: async () => new Uint8Array([1, 2, 3]) } });
  assert.deepEqual(await broken.readFile(USER, 'sales-report', 'references/format.md'), { ok: false, reason: 'failed' });
  const withExe = new JSZip();
  withExe.file('SKILL.md', SKILL_MD);
  withExe.file('references/format.md', 'x');
  withExe.file('run.exe', 'x');
  const refused = createServerSkills({ db, bundles: { download: async () => withExe.generateAsync({ type: 'uint8array' }) } });
  assert.deepEqual(await refused.readFile(USER, 'sales-report', 'references/format.md'), { ok: false, reason: 'failed' }, 'the checks of the page are made again here');
});

test('the store of zips reads the person\'s own file with the service key, and nothing for a bad name or a missing or too large file', async () => {
  const calls = [];
  const respond = (status, body = new Uint8Array([1, 2, 3])) => async (url, options) => { calls.push({ url, headers: options.headers }); return new Response(status === 200 ? body : 'no', { status }); };
  const store = createSkillBundleStore({ url: 'https://db.example', serviceKey: 'service-key-value', fetchImpl: respond(200) });
  assert.deepEqual([...await store.download(USER, 'sales-report')], [1, 2, 3]);
  assert.equal(calls[0].url, `https://db.example/storage/v1/object/user-skill-bundles/${skillBundlePath(USER, 'sales-report')}`);
  assert.equal(calls[0].headers.Authorization, 'Bearer service-key-value');
  assert.equal(await store.download('../x', 'sales-report'), null);
  assert.equal(await store.download(USER, '../etc'), null);
  assert.equal(await store.download('', 'sales-report'), null);
  assert.equal(calls.length, 1, 'no request for a bad name');
  assert.equal(await createSkillBundleStore({ url: 'https://db.example', serviceKey: 'k', fetchImpl: respond(404) }).download(USER, 'sales-report'), null);
  assert.equal(await createSkillBundleStore({ url: 'https://db.example', serviceKey: 'k', fetchImpl: async () => { throw new Error('down'); } }).download(USER, 'sales-report'), null);
  assert.equal(await createSkillBundleStore({ url: 'https://db.example', serviceKey: 'k', fetchImpl: respond(200, new Uint8Array(SKILL_BUNDLE_LIMITS.zipBytes + 1)) }).download(USER, 'sales-report'), null);
});

test('a reply on the server: the model loads a skill with files, reads one, and answers; the rows of the step list say both', async () => {
  const requests = [];
  const live = [];
  const reads = [];
  let round = 0;
  const result = await executeReply({
    spec: goodSpec({ skills: [{ name: 'sales-report', description: 'Builds the sales report.', files: true }] }),
    secrets: { providerKey: 'sk-provider-secret-value' },
    userId: USER,
    skills: {
      body: async (userId, name) => (userId === USER && name === 'sales-report' ? ROW : null),
      readFile: async (userId, name, path) => { reads.push([userId, name, path]); return { ok: true, text: '# Format\nUse bullets.\n', cut: false }; }
    },
    onLive: (event) => live.push(event),
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      round += 1;
      if (round === 1) return streamResponse(sse(toolCall('call_1', 'load_skill', { name: 'sales-report' })));
      if (round === 2) return streamResponse(sse(toolCall('call_2', 'read_skill_file', { skill: 'sales-report', path: 'references/format.md' })));
      return streamResponse(sse(content('Report in bullets.')));
    }
  });
  assert.equal(result.status, 'done');
  assert.equal(result.parts[0].text, 'Report in bullets.');
  const toolNames = (request) => (request.tools || []).map((tool) => tool.function?.name || tool.name);
  assert.deepEqual(toolNames(requests[0]), ['load_skill'], 'nothing to read before the skill is loaded');
  assert.deepEqual(toolNames(requests[1]), ['load_skill', 'read_skill_file']);
  assert.match(JSON.stringify(requests[1].messages), /This skill has 3 files/);
  assert.match(JSON.stringify(requests[2].messages), /Use bullets\./, 'the text of the file is in the last request');
  assert.deepEqual(reads, [[USER, 'sales-report', 'references/format.md']]);
  assert.deepEqual(live.filter((event) => event.ev?.type === 'skill').map((event) => event.ev.label), ['Loading skill: sales-report', 'Reading skill file: references/format.md']);
});
