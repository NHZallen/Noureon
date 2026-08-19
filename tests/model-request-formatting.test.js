import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildTavilySearchQuery,
  formatTavilySearchPacket,
  getSearchCurrentDate,
  normalizeSearchQuery
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
