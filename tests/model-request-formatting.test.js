import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildTavilySearchQuery,
  formatTavilySearchPacket,
  getSearchCurrentDate,
  normalizeSearchQuery,
  normalizePageReads,
  normalizeTinyfishSearch,
  withSearchContext
} from '../src/app/legacy-runtime/features/model-request-formatting.js';
const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('getSearchCurrentDate returns a stable prompt-safe date string', () => {
  const value = getSearchCurrentDate();

  assert.equal(typeof value, 'string');
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(`Current date: ${value}`, /^Current date: \d{4}-\d{2}-\d{2}$/);
});

test('Tavily query formatting normalizes and truncates queries', () => {
  const longQuery = `${'alpha '.repeat(120)}\n\n\`\`\`secret block\`\`\``;
  const normalized = normalizeSearchQuery(longQuery);
  const query = buildTavilySearchQuery(longQuery);

  assert.equal(normalized.includes('secret block'), false);
  assert.ok(normalized.length <= 380);
  assert.ok(query.length <= 380);
  assert.doesNotMatch(query, /[\u0000-\u001f\u007f]/);
});

test('Tavily query formatting adds sports and World Cup boosts', () => {
  const sportsQuery = buildTavilySearchQuery('latest match scores');
  const worldCupQuery = buildTavilySearchQuery('FIFA world cup group stage');

  assert.match(sportsQuery, /official results scores wins fixtures standings/);
  assert.match(worldCupQuery, /FIFA World Cup official match report results scores wins group stage/);
});

test('Tavily search packet formatting preserves provider, query, answer, sources, and score', () => {
  const packet = formatTavilySearchPacket(
    {
      query: 'returned query',
      answer: 'Short answer',
      results: [
        {
          title: 'Source title',
          url: 'https://example.com/story',
          content: 'Useful snippet',
          score: 0.98765
        }
      ]
    },
    'fallback query',
    'Shared packet'
  );

  assert.match(packet, /^# Shared packet/);
  assert.match(packet, /Provider: Tavily/);
  assert.match(packet, /Query: returned query/);
  assert.match(packet, /Current date: \d{4}-\d{2}-\d{2}/);
  assert.match(packet, /Retrieved at: \d{4}-\d{2}-\d{2}T/);
  assert.match(packet, /## Tavily answer\nShort answer/);
  assert.match(packet, /1\. Source title/);
  assert.match(packet, /URL: https:\/\/example\.com\/story/);
  assert.match(packet, /Content: Useful snippet/);
  assert.match(packet, /Score: 0\.988/);
  assert.match(packet, /system-generated web context/);
});

test('Tavily search packet formatting keeps the no-results fallback', () => {
  const packet = formatTavilySearchPacket({ results: [] }, 'fallback query');

  assert.match(packet, /Query: fallback query/);
  assert.match(packet, /No Tavily results were returned\./);
});

test('model request formatting helper remains isolated from runtime side effects', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/model-request-formatting.js');

  for (const forbidden of [
    'document',
    'window',
    'globalThis',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch',
    'addEventListener',
    'removeEventListener',
    'querySelector',
    'getElementById',
    'innerHTML',
    'classList'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`));
  }
});

test('TinyFish results are given the shape of Tavily\'s, whatever the snippet is called', () => {
  const normalized = normalizeTinyfishSearch({
    results: [
      { position: 1, site_name: 'example.org', title: 'First', snippet: ' One ', url: 'https://example.org/1' },
      { position: 2, title: 'Second', text: 'Two', url: 'https://example.org/2' },
      { position: 3, title: 'No address', snippet: 'Lost' },
      { position: 4, domain: 'example.net', content: 'Four', link: 'https://example.net/4' }
    ]
  });

  assert.deepEqual(normalized.results, [
    { title: 'First', url: 'https://example.org/1', content: 'One' },
    { title: 'Second', url: 'https://example.org/2', content: 'Two' },
    { title: 'example.net', url: 'https://example.net/4', content: 'Four' }
  ]);
  assert.equal(normalizeTinyfishSearch({ results: normalized.results.concat(normalized.results) }, 2).results.length, 2, 'limited to what was asked');
  assert.deepEqual(normalizeTinyfishSearch(undefined).results, []);
  assert.equal(normalizeTinyfishSearch([{ title: 'Bare list', url: 'https://example.org' }]).results.length, 1);
});

test('the search packet names the source it came from', () => {
  const data = normalizeTinyfishSearch({ results: [{ title: 'First', url: 'https://example.org/1', snippet: 'One' }] });
  const packet = formatTavilySearchPacket(data, 'query', 'Web search packet', 'TinyFish');
  assert.match(packet, /Provider: TinyFish/);
  assert.match(packet, /URL: https:\/\/example\.org\/1/);
  assert.match(packet, /Content: One/);
  assert.doesNotMatch(packet, /Tavily/);
  assert.match(formatTavilySearchPacket({ results: [] }, 'query', 'Web search packet', 'TinyFish'), /No TinyFish results were returned/);
  assert.match(formatTavilySearchPacket({ results: [] }, 'query'), /Provider: Tavily/, 'Tavily stays the default');
});

test('page reader results are cut to length, and the pages that did not come back are named', () => {
  const data = { results: [
    { url: 'https://a.test/1', final_url: 'https://a.test/redirected', title: ' A ', text: ' ' + 'y'.repeat(30), language: 'fr' },
    { url: 'https://a.test/2', title: 'Empty', text: '   ' },
    { title: 'No address', text: 'lost' },
    { url: 'https://a.test/4', markdown: 'In another field' },
    { url: 'https://a.test/6', raw_content: 'Tavily calls it raw_content' }
  ] };
  const { pages, failed } = normalizePageReads(data, {
    requested: ['https://a.test/1', 'https://a.test/2', 'https://a.test/4', 'https://a.test/5', 'https://a.test/6'],
    maxChars: 10
  });
  assert.deepEqual(pages.map((page) => [page.url, page.text, page.truncated]), [
    ['https://a.test/1', 'yyyyyyyyyy', true],
    ['https://a.test/4', 'In another', true],
    ['https://a.test/6', 'Tavily cal', true]
  ]);
  assert.equal(pages[0].finalUrl, 'https://a.test/redirected');
  assert.equal(pages[0].title, 'A');
  assert.equal(pages[0].language, 'fr');
  assert.deepEqual(failed, ['https://a.test/2', 'https://a.test/5']);
  assert.deepEqual(normalizePageReads(undefined, { requested: ['https://a.test/1'] }), { pages: [], failed: ['https://a.test/1'] });
  assert.equal(normalizePageReads({ results: [{ url: 'https://a.test/1', text: 'z'.repeat(9000) }] }).pages[0].text.length, 8000, 'eight thousand characters by default');
});

test('a search is for what the text says: no date and no "latest" unless the text asks about what is current', () => {
  // These were the whole query of "go look it up": time converters, exam timetables and pre-order pages came back.
  assert.equal(buildTavilySearchQuery('你去查阿'), '你去查阿');
  assert.equal(buildTavilySearchQuery('DeepSeek V4.1 Flash 的思考參數是什麼'), 'DeepSeek V4.1 Flash 的思考參數是什麼');
  assert.doesNotMatch(buildTavilySearchQuery('How do I reverse a list in Python?'), /current date|latest|\d{4}-\d{2}-\d{2}/);

  const today = getSearchCurrentDate();
  for (const text of ['最新的 iPhone 價格', 'What is the weather today?', 'latest news about the election', 'météo à Paris', 'новости сегодня']) {
    assert.equal(buildTavilySearchQuery(text), `${text} ${today} latest`, text);
  }
});

test('a query that was built is not given its date and boost a second time', () => {
  for (const text of ['latest news', 'FIFA World Cup 2026 scores', '世界盃賽程']) {
    const once = buildTavilySearchQuery(text);
    assert.equal(buildTavilySearchQuery(once), once, text);
  }
  assert.match(buildTavilySearchQuery('世界盃賽程'), /FIFA World Cup official match report/);
});

const userMessage = (text) => ({ role: 'user', parts: [{ text }] });
const modelMessage = (text) => ({ role: 'model', parts: [{ text }] });

test('a message that only says to search takes its subject from the messages before it', () => {
  const messages = [
    userMessage('DeepSeek V4.1 Flash 有沒有思考深度參數？'),
    modelMessage('我不確定，需要查證。'),
    userMessage('你去查阿')
  ];
  assert.equal(withSearchContext('你去查阿', messages), 'DeepSeek V4.1 Flash 有沒有思考深度參數？ 你去查阿');
  // The same with the current message not in the list yet.
  assert.equal(withSearchContext('你去查阿', messages.slice(0, 2)), 'DeepSeek V4.1 Flash 有沒有思考深度參數？ 你去查阿');
  for (const thin of ['搜索 你去查阿', 'please search', 'search again', 'go look it up', 'cherche', '查一下', '幫我查！']) {
    assert.match(withSearchContext(thin, [userMessage('What is the context window of Claude Opus 5.5?'), userMessage(thin)]), /^What is the context window of Claude Opus 5\.5\? /, thin);
  }
});

test('only the last two earlier messages that have a subject are used, each cut, and the assistant\'s are not', () => {
  const messages = [
    userMessage('first question about the Rust borrow checker'),
    userMessage('second question about Go generics in detail'),
    userMessage('ok'),
    modelMessage('A long answer about something else entirely, which is not a question'),
    userMessage('third question about Python decorators ' + 'x'.repeat(400)),
    userMessage('search')
  ];
  const query = withSearchContext('search', messages);
  assert.ok(query.startsWith('second question about Go generics in detail third question about Python decorators'));
  assert.doesNotMatch(query, /Rust|something else|\bok\b/);
  assert.equal(query.length, 'second question about Go generics in detail'.length + 1 + 200 + 1 + 'search'.length, 'each earlier message is cut to 200 characters');
});

test('a message with a subject of its own is searched as it is, and one with no history is left alone', () => {
  const history = [userMessage('something earlier about Kubernetes operators')];
  assert.equal(withSearchContext('What is the capital of Australia?', history), 'What is the capital of Australia?');
  assert.equal(withSearchContext('DeepSeek V4.1 Flash 思考', history), 'DeepSeek V4.1 Flash 思考');
  assert.equal(withSearchContext('你去查阿', []), '你去查阿');
  assert.equal(withSearchContext('你去查阿', undefined), '你去查阿');
  assert.equal(withSearchContext('你去查阿', [userMessage('ok'), userMessage('你去查阿')]), '你去查阿', 'earlier messages with no subject do not help');
  assert.equal(withSearchContext('', history), 'something earlier about Kubernetes operators');
});

