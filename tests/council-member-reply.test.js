import assert from 'node:assert/strict';
import test from 'node:test';

import { createCouncilMembers, createMemberSteps } from '../src/app/runtime/council/council-member-reply.js';

const tooly = { id: 'tooly', name: 'Tooly', provider: 'openrouter' };
const other = { id: 'other', name: 'Other', provider: 'openrouter' };
const gemini = { id: 'gemini-x', name: 'Gemini', provider: 'gemini' };
const plain = { id: 'plain', name: 'Plain', provider: 'nvidia' };

// A model that searches once (the query is its id), then answers citing what it was given.
const searchingModel = (log = []) => async (parts, onChunk, signal, forceWebSearch, options) => {
  log.push({ id: options.modelInfo.id, forceWebSearch, tools: (options.tools || []).map((tool) => tool.name), parts });
  if (!options.toolTurns.length) {
    options.onResponseComplete({ toolCalls: [{ id: 'c1', name: 'web_search', args: { query: options.modelInfo.id, note: 'Looking it up' } }] });
    return '';
  }
  const given = options.toolTurns.at(-1).results[0].content;
  const numbers = [...given.matchAll(/^\[(\d+)\]/gm)].map((match) => match[1]);
  onChunk(`${options.modelInfo.name} answer ${numbers.map((n) => `[${n}]`).join('')}`);
  options.onResponseComplete({ toolCalls: [] });
  return '';
};

const research = {
  searchWeb: async ({ query }) => ({
    results: query === 'tooly'
      ? [{ url: 'https://a.example/', title: 'A', content: 'a' }, { url: 'https://b.example/', title: 'B', content: 'b' }]
      : [{ url: 'https://b.example/', title: 'B', content: 'b' }, { url: 'https://c.example/', title: 'C', content: 'c' }]
  }),
  openPage: async () => ({ pages: [], failed: [] })
};

test('members search by themselves with one list of numbers: a page has the same number in every answer', async () => {
  const log = [];
  const members = createCouncilMembers({ streamApiCall: searchingModel(log), research, canCallTools: () => true, language: 'en' });
  const steps = [];
  const first = await members.answer({ modelInfo: tooly, parts: [{ text: 'Q' }], searchOn: true, onStep: (step) => steps.push(['tooly', step]) });
  const second = await members.answer({ modelInfo: other, parts: [{ text: 'Q' }], searchOn: true, onStep: (step) => steps.push(['other', step]) });
  assert.equal(first, 'Tooly answer [1][2]');
  assert.equal(second, 'Other answer [2][3]', 'b.example is [2] for the second member too, c.example comes next');
  assert.deepEqual(log[0].tools, ['web_search', 'open_page', 'find_in_page']);
  assert.deepEqual(steps.map(([id, step]) => [id, step.kind]), [['tooly', 'search'], ['other', 'search']]);
  assert.match(steps[0][1].label, /tooly/);
  assert.deepEqual(members.sources().map((source) => [source.n, source.url]), [[1, 'https://a.example/'], [2, 'https://b.example/'], [3, 'https://c.example/']]);
});

test('a council taken up again goes on numbering after the pages it had', async () => {
  const members = createCouncilMembers({
    streamApiCall: searchingModel(),
    research,
    canCallTools: () => true,
    sources: [{ n: 1, url: 'https://b.example/', title: 'B' }, { n: 2, url: 'https://z.example/', title: 'Z' }]
  });
  assert.equal(await members.answer({ modelInfo: other, parts: [{ text: 'Q' }], searchOn: true }), 'Other answer [1][3]');
});

test('Gemini searches with Google (no other tool next to it), and its pages get the next numbers', async () => {
  const seen = [];
  const members = createCouncilMembers({
    streamApiCall: async (parts, onChunk, signal, forceWebSearch, options) => {
      seen.push({ forceWebSearch, tools: options.tools });
      options.onSources([{ url: 'https://g.example/', title: 'G' }]);
      return 'gemini text';
    },
    research,
    canCallTools: () => true,
    usesNativeSearch: (model) => model.provider === 'gemini',
    loadersFor: () => { throw new Error('no loader next to Google search'); },
    sources: [{ n: 1, url: 'https://a.example/' }]
  });
  const steps = [];
  assert.equal(await members.answer({ modelInfo: gemini, parts: [{ text: 'Q' }], searchOn: true, onStep: (step) => steps.push(step.kind) }), 'gemini text');
  assert.deepEqual(seen, [{ forceWebSearch: true, tools: undefined }]);
  assert.deepEqual(steps, ['search']);
  assert.deepEqual(members.sources().map((source) => [source.n, source.url]), [[1, 'https://a.example/'], [2, 'https://g.example/']]);
});

test('without the search, a member with skills or connectors to read gets the small loop; with nothing to load, one call', async () => {
  const calls = [];
  const loader = {
    tools: [{ name: 'load_skill', description: 'x', parameters: { type: 'object', properties: {} } }],
    handles: (name) => name === 'load_skill',
    used: 0,
    noteFor: () => 'notes',
    run: async () => 'skill text',
    describe: () => ''
  };
  const members = createCouncilMembers({
    streamApiCall: async (parts, onChunk, signal, forceWebSearch, options) => {
      calls.push((options.tools || []).map((tool) => tool.name));
      onChunk('done');
      options.onResponseComplete?.({ toolCalls: [] });
      return 'done';
    },
    research,
    canCallTools: () => true,
    loadersFor: async (model) => (model.id === 'tooly' ? loader : null)
  });
  assert.equal(await members.answer({ modelInfo: tooly, parts: [{ text: 'Q' }], searchOn: false }), 'done');
  assert.equal(await members.answer({ modelInfo: other, parts: [{ text: 'Q' }], searchOn: false }), 'done');
  assert.deepEqual(calls, [['load_skill'], []]);
});

test('a model that calls no tools searches once with its own query, put before its question', async () => {
  const seen = [];
  const members = createCouncilMembers({
    streamApiCall: async (parts) => {
      seen.push(parts.map((part) => part.text));
      return 'plain answer';
    },
    research,
    canCallTools: (model) => model.id !== 'plain',
    fetchPacket: async (query) => `packet for ${query}`,
    buildQuery: async (parts, model) => `query of ${model.id}`
  });
  const steps = [];
  assert.equal(await members.answer({ modelInfo: plain, parts: [{ text: 'Q' }], searchOn: true, onStep: (step) => steps.push(step.kind) }), 'plain answer');
  assert.deepEqual(seen, [['packet for query of plain', 'Q']]);
  assert.deepEqual(steps, ['search']);
});

test('a member that fails is tried once more as a whole; a stop is not tried again', async () => {
  let tries = 0;
  const retries = [];
  const members = createCouncilMembers({
    streamApiCall: async () => {
      tries += 1;
      if (tries === 1) throw new Error('busy');
      return 'second try';
    },
    canCallTools: () => false
  });
  assert.equal(await members.answer({ modelInfo: plain, parts: [{ text: 'Q' }], onRetry: (error) => retries.push(error.message) }), 'second try');
  assert.deepEqual(retries, ['busy']);

  const failing = createCouncilMembers({ streamApiCall: async () => { throw new Error('down'); }, canCallTools: () => false });
  await assert.rejects(() => failing.answer({ modelInfo: plain, parts: [] }), /down \(retried once; first attempt: down\)/);

  const controller = new AbortController();
  let stoppedTries = 0;
  const stopped = createCouncilMembers({
    streamApiCall: async () => {
      stoppedTries += 1;
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    },
    canCallTools: () => false
  });
  await assert.rejects(() => stopped.answer({ modelInfo: plain, parts: [], signal: controller.signal }), { name: 'AbortError' });
  assert.equal(stoppedTries, 1);
});

test('the steps of a member: counts of each kind and the newest steps only', () => {
  const steps = createMemberSteps();
  for (let index = 0; index < 35; index += 1) steps.add({ kind: 'search', label: `s${index}` });
  steps.add({ kind: 'page', label: 'p' });
  steps.add({ kind: 'nonsense', label: 'x' });
  const view = steps.view();
  assert.deepEqual(view.counts, { search: 35, page: 1, skill: 0, connector: 0 });
  assert.equal(view.steps.length, 30);
  assert.equal(view.steps.at(-1).label, 'p');
});

test('the members\' module is for the page and the server alike (no DOM)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/app/runtime/council/council-member-reply.js', import.meta.url), 'utf8');
  for (const forbidden of ['document.', 'window.', 'localStorage', 'import.meta.env']) assert.equal(source.includes(forbidden), false, forbidden);
});
