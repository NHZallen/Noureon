import assert from 'node:assert/strict';
import test from 'node:test';

import { createWebResearchTools } from '../src/app/legacy-runtime/features/web-research-tools.js';
import { formatTavilySearchPacket, normalizePageReads, normalizeTinyfishSearch, resultDate } from '../src/app/legacy-runtime/features/model-request-formatting.js';

// Tavily and TinyFish as a fake internet: each endpoint answers with what it is given, or fails.
const harness = ({ keys = { tavily: 'tv', tinyfish: 'tf' }, provider = 'tavily', tavily, tinyfish, pages } = {}) => {
  const asked = [];
  let clock = 0;
  const answers = {
    '/api/tavily-search': tavily,
    '/api/tinyfish-search': tinyfish,
    '/api/tinyfish-fetch': pages,
    '/api/tavily-extract': pages
  };
  const fetchImpl = async (url, { body }) => {
    asked.push([url, JSON.parse(body)]);
    const answer = answers[url];
    const value = typeof answer === 'function' ? answer() : answer;
    if (value instanceof Error) return { ok: false, status: 500, json: async () => ({}), text: async () => 'fail' };
    return { ok: true, status: 200, json: async () => value };
  };
  const tools = createWebResearchTools({
    getConfig: () => ({ searchProvider: provider }),
    getApiKeyForProvider: (name) => keys[name] || '',
    fetchImpl,
    getErrorMessage: (body, fallback) => fallback,
    readErrorBody: async () => ({}),
    normalizeTinyfishSearch,
    normalizePageReads,
    now: () => clock
  });
  return { tools, asked, advance: (ms) => { clock += ms; } };
};

const hit = (title) => ({ results: [{ title, url: `https://${title}.example/`, content: 'x' }] });
const sources = (asked) => asked.map(([url]) => url);

test('when the chosen search fails or finds nothing the other is asked, if its key is set', async () => {
  const failing = harness({ tavily: new Error('down'), tinyfish: hit('tf') });
  assert.equal((await failing.tools.searchWeb({ query: 'q' })).results[0].title, 'tf');
  assert.deepEqual(sources(failing.asked), ['/api/tavily-search', '/api/tinyfish-search']);

  const empty = harness({ tavily: { results: [] }, tinyfish: hit('tf') });
  assert.equal((await empty.tools.searchWeb({ query: 'q' })).results[0].title, 'tf');

  const noKeyChosen = harness({ keys: { tinyfish: 'tf' }, tavily: hit('tv'), tinyfish: hit('tf') });
  assert.equal((await noKeyChosen.tools.searchWeb({ query: 'q' })).results[0].title, 'tf', 'the chosen one has no key: the other is used');
});

test('with one key only nothing else is required: its error is the error and an empty answer is the answer', async () => {
  const one = harness({ keys: { tavily: 'tv' }, tavily: new Error('down') });
  await assert.rejects(one.tools.searchWeb({ query: 'q' }), /Tavily HTTP 500/);
  assert.deepEqual(sources(one.asked), ['/api/tavily-search'], 'the other was not tried');
  const emptyOnly = harness({ keys: { tavily: 'tv' }, tavily: { results: [] } });
  assert.deepEqual(await emptyOnly.tools.searchWeb({ query: 'q' }), { results: [] });
  const none = harness({ keys: {}, tavily: hit('tv') });
  await assert.rejects(none.tools.searchWeb({ query: 'q' }), /No tavily API key/);
  const bothFail = harness({ tavily: new Error('a'), tinyfish: new Error('b') });
  await assert.rejects(bothFail.tools.searchWeb({ query: 'q' }), /Tavily HTTP 500/, 'the first one\'s error is told');
});

test('a search just made is not made again, news is forgotten sooner, and a failure is not remembered', async () => {
  let calls = 0;
  const h = harness({ tavily: () => { calls += 1; return hit(`r${calls}`); } });
  assert.equal((await h.tools.searchWeb({ query: 'Same Query' })).results[0].title, 'r1');
  assert.equal((await h.tools.searchWeb({ query: 'same query ' })).results[0].title, 'r1', 'same words, same answer');
  assert.equal((await h.tools.searchWeb({ query: 'same query', topic: 'news' })).results[0].title, 'r2', 'news is its own search');
  h.advance(3 * 60_000);
  assert.equal((await h.tools.searchWeb({ query: 'same query', topic: 'news' })).results[0].title, 'r3', 'news is asked again after two minutes');
  assert.equal((await h.tools.searchWeb({ query: 'same query' })).results[0].title, 'r1', 'the rest keeps for ten');
  h.advance(8 * 60_000);
  assert.equal((await h.tools.searchWeb({ query: 'same query' })).results[0].title, 'r4');

  let flaky = 0;
  const g = harness({ keys: { tavily: 'tv' }, tavily: () => { flaky += 1; return flaky === 1 ? { results: [] } : hit('late'); } });
  assert.deepEqual((await g.tools.searchWeb({ query: 'q' })).results, []);
  assert.equal((await g.tools.searchWeb({ query: 'q' })).results[0].title, 'late', 'an empty answer is asked again');
});

test('a page read a moment ago is not read again, and only the pages not yet read are fetched', async () => {
  const page = (url) => ({ results: [{ url, title: url, text: `text of ${url}` }] });
  const h = harness({ provider: 'tinyfish', pages: () => page('https://a.example/') });
  const first = await h.tools.fetchPageContents(['https://a.example/'], undefined, { maxChars: 150_000 });
  assert.equal(first.pages.length, 1);
  const again = await h.tools.fetchPageContents(['https://a.example/'], undefined, { maxChars: 150_000 });
  assert.equal(again.pages[0].text, 'text of https://a.example/');
  assert.equal(h.asked.length, 1, 'the second read came from memory');
  await h.tools.fetchPageContents(['https://a.example/'], undefined, { maxChars: 8000 });
  assert.equal(h.asked.length, 2, 'a different length is a different read');
  h.advance(16 * 60_000);
  await h.tools.fetchPageContents(['https://a.example/'], undefined, { maxChars: 150_000 });
  assert.equal(h.asked.length, 3, 'and after a while it is read again');
});

test('the date of a result is read from what the sources call it, and shown in the search packet', () => {
  assert.equal(resultDate({ published_date: '2026-09-29T08:00:00Z' }), '2026-09-29');
  assert.equal(resultDate({ date: 'Tue, 29 Sep 2026 10:00:00 GMT' }), '2026-09-29');
  assert.equal(resultDate({ published_date: 'soon' }), '');
  assert.equal(resultDate({}), '');
  const tiny = normalizeTinyfishSearch({ results: [{ url: 'https://a.example/', title: 'A', snippet: 's', published_at: '2026-09-01' }] });
  assert.equal(tiny.results[0].published_date, '2026-09-01');
  const packet = formatTavilySearchPacket({ results: [{ title: 'A', url: 'https://a.example/', content: 's', published_date: '2026-09-29' }, { title: 'B', url: 'https://b.example/', content: 't' }] }, 'q');
  assert.match(packet, /\[1\] A\nURL: https:\/\/a\.example\/\nPublished: 2026-09-29\nContent: s/);
  assert.match(packet, /\[2\] B\nURL: https:\/\/b\.example\/\nContent: t/);
});
