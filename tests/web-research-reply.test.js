import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_RESEARCH_CALLS,
  RESEARCH_TOOLS,
  pageText,
  researchGuidance,
  runWebResearchReply,
  searchResultText
} from '../src/app/legacy-runtime/features/web-research-reply.js';
import { SANDBOX_TEXT_LANGUAGES, sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';

// A model that asks for the given calls round by round, then answers.
function scriptedModel(rounds) {
  const requests = [];
  const streamApiCall = async (parts, onChunk, signal, forced, options) => {
    requests.push({ ...options, turns: options.toolTurns.length });
    const round = rounds[requests.length - 1] || { text: 'Done.' };
    if (round.error) throw round.error;
    for (const chunk of round.chunks || [round.text || '']) onChunk(chunk);
    for (const raw of round.argumentChunks || []) options.onToolArguments?.({ name: 'web_search', arguments: raw });
    options.onResponseComplete({ text: round.text || '', toolCalls: round.calls || [] });
    return round.text || '';
  };
  return { streamApiCall, requests };
}

const search = (id, query, topic, note) => ({ id, name: 'web_search', args: { ...(note ? { note } : {}), query, ...(topic ? { topic } : {}) } });
const open = (id, url, note) => ({ id, name: 'open_page', args: { ...(note ? { note } : {}), url } });

const tools = ({ results, pages } = {}) => {
  const searches = [];
  const opened = [];
  return {
    searches,
    opened,
    searchWeb: async (input) => {
      searches.push(input);
      if (results instanceof Error) throw results;
      return { results: results || [{ title: 'Releases', url: 'https://github.com/a/b/releases', content: 'v2.0' }] };
    },
    openPage: async (urls) => {
      opened.push(...urls);
      if (pages instanceof Error) throw pages;
      return pages || { pages: [{ url: urls[0], title: 'Releases', text: 'notes of v2.0' }], failed: [] };
    }
  };
};

const run = (model, helper, extra = {}) => {
  const chunks = [];
  const events = [];
  const found = [];
  return runWebResearchReply({
    streamApiCall: model.streamApiCall,
    requestParts: [{ text: 'question' }],
    onChunk: (chunk) => chunks.push(chunk),
    requestOptions: {},
    searchWeb: helper.searchWeb,
    openPage: helper.openPage,
    language: 'en',
    today: '2026-10-01',
    onEvent: (event) => events.push(event),
    onSources: (sources) => found.push(...sources),
    ...extra
  }).then((result) => ({ ...result, chunks, events, found }));
};

test('the model searches, opens a page and answers, each call a row and the sources reported', async () => {
  const model = scriptedModel([
    { calls: [search('1', 'a/b releases', undefined, 'Let me look.')] },
    { text: '', calls: [open('2', 'https://github.com/a/b/releases')] },
    { text: 'v2.0 is the latest.' }
  ]);
  const helper = tools();
  const result = await run(model, helper);
  assert.equal(result.text, 'v2.0 is the latest.');
  assert.equal(result.calls, 2);
  assert.deepEqual(helper.searches.map((entry) => [entry.query, entry.topic]), [['a/b releases', 'general']]);
  assert.deepEqual(helper.opened, ['https://github.com/a/b/releases']);
  assert.deepEqual(result.events.map((event) => event.type), ['narration', 'searching', 'sources', 'searching', 'sources', 'answering']);
  assert.equal(result.events[0].text, 'Let me look.', 'what the model says about a call is its note, shown between the rows, not in the answer');
  assert.equal(result.events[1].label, 'Searching: a/b releases');
  assert.equal(result.events[3].label, 'Reading page: github.com');
  assert.deepEqual(result.events[4].sources, [{ title: 'Releases', url: 'https://github.com/a/b/releases', read: true }]);
  assert.equal(result.found.length, 2);
  assert.deepEqual(model.requests.map((request) => request.turns), [0, 1, 2]);
  assert.deepEqual(model.requests[0].tools.map((tool) => tool.name), ['web_search', 'open_page', 'find_in_page']);
  assert.match(model.requests[0].additionalSystemInstruction, /Today is 2026-10-01/);
  assert.equal(result.chunks.join(''), 'v2.0 is the latest.');
});

test('what the model reads back is the results and the page, marked as source material', async () => {
  const model = scriptedModel([
    { calls: [search('1', 'q'), open('2', 'https://example.com/p')] },
    { text: 'ok' }
  ]);
  await run(model, tools());
  const [first, second] = model.requests[1].toolTurns[0].results;
  assert.equal(first.id, '1');
  assert.match(first.content, /Results for "q":\n\n1\. Releases\nURL: https:\/\/github\.com\/a\/b\/releases\nSnippet: v2\.0/);
  assert.equal(second.id, '2');
  assert.match(second.content, /<web_page_text>\nnotes of v2\.0\n<\/web_page_text>/);
});

test('the words of a round are the answer and show as they come, even when a call follows', async () => {
  const model = scriptedModel([{ chunks: ['I will ', 'look it up.'], text: 'I will look it up.', calls: [search('1', 'q')] }, { text: 'tail' }]);
  const result = await run(model, tools());
  assert.deepEqual(result.chunks, ['I will ', 'look it up.', '\n\ntail'], 'nothing is held back to find out whether it was an announcement');
  assert.equal(result.events.some((event) => event.type === 'narration'), false, 'a call without a note has no narration');
  assert.equal(result.text, 'I will look it up.\n\ntail');
  assert.equal(result.events.filter((event) => event.type === 'answering').length, 2, 'each round that writes tells the step list the answer began');
});

test('a note is told once, as soon as it is complete, and a short answer streams without waiting for the round to end', async () => {
  const model = scriptedModel([
    { argumentChunks: ['{"note":"Checking the rel', '{"note":"Checking the releases.","que', '{"note":"Checking the releases.","query":"q"}'], calls: [search('1', 'q', undefined, 'Checking the releases.')] },
    { chunks: ['Short ', 'answer.'], text: 'Short answer.' }
  ]);
  const told = [];
  const original = model.streamApiCall;
  const events = [];
  const result = await runWebResearchReply({
    streamApiCall: (parts, onChunk, signal, forced, options) => original(parts, onChunk, signal, forced, { ...options, onToolArguments: (value) => { options.onToolArguments(value); told.push(events.filter((event) => event.type === 'narration').length); } }),
    requestParts: [{ text: 'q' }], searchWeb: tools().searchWeb, openPage: tools().openPage, language: 'en', today: '2026-10-01', onEvent: (event) => events.push(event)
  });
  assert.deepEqual(told, [0, 1, 1]);
  assert.equal(events.filter((event) => event.type === 'narration').length, 1);
  assert.equal(result.text, 'Short answer.');
});

test('a search or a page that fails is told to the model, which goes on', async () => {
  const model = scriptedModel([
    { calls: [search('1', 'q'), open('2', 'https://example.com/p')] },
    { text: 'could not' }
  ]);
  const result = await run(model, tools({ results: new Error('boom'), pages: { pages: [], failed: [{ url: 'https://example.com/p', reason: 'failed' }] } }));
  const [first, second] = model.requests[1].toolTurns[0].results;
  assert.match(first.content, /The search failed \(boom\)/);
  assert.match(second.content, /could not be read/);
  assert.equal(result.text, 'could not');
  assert.deepEqual(result.events.filter((event) => event.type === 'sources').map((event) => event.sources), [[], []], 'a call that found nothing leaves no row');
});

test('no page reader key is said so, and a repeated page or a bad address is not fetched again', async () => {
  const model = scriptedModel([
    { calls: [open('1', 'https://example.com/p'), open('2', 'https://example.com/p'), open('3', 'ftp://x'), { id: '4', name: 'web_search', args: {} }] },
    { text: 'done' }
  ]);
  const helper = tools({ pages: { pages: [], failed: [{ url: 'https://example.com/p', reason: 'noReader' }] } });
  await run(model, helper);
  const contents = model.requests[1].toolTurns[0].results.map((entry) => entry.content);
  assert.match(contents[0], /needs a Tavily or TinyFish API key/);
  assert.match(contents[1], /needs a Tavily or TinyFish API key/, 'a page that could not be read is not fetched again');
  assert.match(contents[2], /no valid "url"/);
  assert.match(contents[3], /no "query"/);
  assert.deepEqual(helper.opened, ['https://example.com/p']);
});

test('after the limit the model is given no tools and answers with what it has', async () => {
  const rounds = Array.from({ length: MAX_RESEARCH_CALLS }, (_, index) => ({ calls: [search(String(index), `q${index}`)] }));
  rounds.push({ text: 'final' });
  const model = scriptedModel(rounds);
  const helper = tools();
  const result = await run(model, helper);
  assert.equal(helper.searches.length, MAX_RESEARCH_CALLS);
  assert.equal(result.calls, MAX_RESEARCH_CALLS);
  assert.deepEqual(model.requests.at(-1).tools, []);
  assert.equal(result.text, 'final');
});

test('stopping keeps what was written and runs nothing more', async () => {
  const controller = new AbortController();
  const model = scriptedModel([{ text: 'partial', calls: [] }]);
  const stopping = { ...model, streamApiCall: async (...args) => { const out = await model.streamApiCall(...args); controller.abort(); return out; } };
  const result = await run(stopping, tools(), { signal: controller.signal });
  assert.equal(result.text, 'partial');
});

test('a provider error before anything happened reaches the caller', async () => {
  const model = scriptedModel([{ error: new Error('tools refused') }]);
  await assert.rejects(run(model, tools()), /tools refused/);
});

test('the texts and the tools are complete', () => {
  assert.deepEqual(RESEARCH_TOOLS.map((tool) => tool.name), ['web_search', 'open_page', 'find_in_page']);
  for (const language of SANDBOX_TEXT_LANGUAGES) {
    assert.match(sandboxText(language, 'webSearchingFor', { query: 'Q' }), /Q/);
    assert.match(sandboxText(language, 'webOpeningPage', { host: 'H' }), /H/);
  }
  assert.match(researchGuidance('2026-10-01'), /\/releases/);
  assert.match(searchResultText('q', []), /No results/);
  assert.match(pageText({ url: 'https://a.test', text: `${'T'.repeat(30_000)}` }), /Call open_page with start=10000 for the next part/);
});

const longPage = () => {
  const menu = ['Skip to content', 'Navigation Menu', ...Array.from({ length: 20 }, (_, index) => `- [Item ${index}](/menu/${index})`)].join('\n');
  const body = Array.from({ length: 400 }, (_, index) => `Paragraph ${index} about nothing in particular, written long enough to be read as a sentence of prose.`).join('\n');
  return `${menu}\n\n# Releases\n\n${body}\nThe latest version is v17.3.0, see [notes](/a/b/releases/tag/v17.3.0).`;
};

test('a long page is read a window at a time, whole and with full-address links, and a word is found in it', async () => {
  const model = scriptedModel([
    { calls: [open('1', 'https://github.com/a/b/releases')] },
    { calls: [open('2', 'https://github.com/a/b/releases'), { id: '3', name: 'open_page', args: { url: 'https://github.com/a/b/releases', start: 10000 } }, { id: '4', name: 'find_in_page', args: { url: 'https://github.com/a/b/releases', query: 'latest version' } }] },
    { text: 'done' }
  ]);
  const helper = tools({ pages: { pages: [{ url: 'https://github.com/a/b/releases', title: 'Releases', text: longPage() }], failed: [] } });
  const result = await run(model, helper);
  const first = model.requests[1].toolTurns[0].results[0].content;
  assert.match(first, /Navigation Menu/, 'the menu is not cut');
  assert.match(first, /^Page: Releases/);
  assert.match(first, /\[Item 3\]\(https:\/\/github\.com\/menu\/3\)/);
  assert.match(first, /Call open_page with start=\d+ for the next part/);
  const [again, next, found] = model.requests[2].toolTurns[1].results.map((entry) => entry.content);
  assert.match(again, /already opened/);
  assert.match(next, /\(Characters 10000-/);
  assert.match(found, /Passages with "latest version"/);
  assert.match(found, /The latest version is v17\.3\.0, see \[notes\]\(https:\/\/github\.com\/a\/b\/releases\/tag\/v17\.3\.0\)/, 'links are full addresses');
  assert.equal(helper.opened.length, 1, 'the page is fetched once, whatever is done with it');
  assert.equal(result.events.filter((event) => event.type === 'searching').length, 1, 'and is one row');
});

test('find_in_page opens the page when it was not, and says when a word is not in it', async () => {
  const model = scriptedModel([
    { calls: [{ id: '1', name: 'find_in_page', args: { url: 'https://example.com/p', query: 'zebra' } }, { id: '2', name: 'find_in_page', args: { url: 'https://example.com/p' } }] },
    { text: 'ok' }
  ]);
  const helper = tools({ pages: { pages: [{ url: 'https://example.com/p', text: 'a short page about cats' }], failed: [] } });
  await run(model, helper);
  const [none, bad] = model.requests[1].toolTurns[0].results.map((entry) => entry.content);
  assert.match(none, /"zebra" is not in this page/);
  assert.match(bad, /needs a valid "url"/);
  assert.deepEqual(helper.opened, ['https://example.com/p']);
});

test('what a round asks for is fetched together, the pages in one request, and answered in the order asked', async () => {
  const log = [];
  const gates = new Map();
  const gate = (name) => new Promise((resolve) => gates.set(name, resolve));
  const waits = { a: gate('a'), b: gate('b') };
  let opened = [];
  const searchWeb = async ({ query }) => {
    log.push(`start ${query}`);
    await waits[query];
    log.push(`end ${query}`);
    return { results: [{ title: query, url: `https://${query}.example/`, content: 'x' }] };
  };
  const openPage = async (urls) => {
    opened.push([...urls]);
    return { pages: urls.map((url) => ({ url, title: url, text: `text of ${url}` })), failed: [] };
  };
  const model = scriptedModel([
    { calls: [search('1', 'a'), search('2', 'b'), open('3', 'https://p1.example/'), open('4', 'https://p2.example/')] },
    { text: 'done' }
  ]);
  const running = runWebResearchReply({
    streamApiCall: model.streamApiCall, requestParts: [{ text: 'q' }], searchWeb, openPage, language: 'en', today: '2026-10-01', onEvent: () => {}
  });
  // Let the round's calls start: both searches are under way before either has answered.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(log, ['start a', 'start b']);
  gates.get('b')();
  await new Promise((resolve) => setTimeout(resolve, 5));
  gates.get('a')();
  const result = await running;
  assert.equal(result.text, 'done');
  assert.deepEqual(opened, [['https://p1.example/', 'https://p2.example/']], 'the two pages went to the reader in one request');
  const answered = model.requests[1].toolTurns[0].results;
  assert.deepEqual(answered.map((entry) => entry.id), ['1', '2', '3', '4'], 'answered in the order asked');
  assert.match(answered[0].content, /Results for "a"/);
  assert.match(answered[2].content, /text of https:\/\/p1\.example\//);
});

test('the same search or page asked twice in a reply is one fetch', async () => {
  const model = scriptedModel([
    { calls: [search('1', 'Same Query'), search('2', 'same query'), open('3', 'https://p.example/')] },
    { calls: [open('4', 'https://p.example/'), { id: '5', name: 'find_in_page', args: { url: 'https://p.example/', query: 'text' } }] },
    { text: 'done' }
  ]);
  const helper = tools({ pages: { pages: [{ url: 'https://p.example/', title: 'P', text: 'some text here' }], failed: [] } });
  const events = [];
  await run(model, helper, { onEvent: (event) => events.push(event) });
  assert.equal(helper.searches.length, 1);
  assert.deepEqual(helper.opened, ['https://p.example/']);
  assert.match(model.requests[2].toolTurns[1].results[0].content, /You already opened this page/);
  assert.match(model.requests[2].toolTurns[1].results[1].content, /some text here/);
});

test('a result\'s publishing date is shown to the model when the source gave one', () => {
  const text = searchResultText('q', [
    { title: 'New', url: 'https://a.example/', content: 'x', published_date: 'Tue, 29 Sep 2026 10:00:00 GMT' },
    { title: 'Undated', url: 'https://b.example/', content: 'y' },
    { title: 'Odd', url: 'https://c.example/', content: 'z', published_date: 'last tuesday-ish' }
  ]);
  assert.match(text, /1\. New\nURL: https:\/\/a\.example\/\nDate: 2026-09-29\nSnippet: x/);
  assert.match(text, /2\. Undated\nURL: https:\/\/b\.example\/\nSnippet: y/);
  assert.match(text, /3\. Odd\nURL: https:\/\/c\.example\/\nSnippet: z/, 'a date that cannot be read is left out');
  assert.match(researchGuidance('2026-10-01'), /Date:/);
});
