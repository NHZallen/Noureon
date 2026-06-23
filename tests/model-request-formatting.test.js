import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  appendStepPlanAttachmentContent,
  buildTavilySearchQuery,
  formatTavilySearchPacket,
  getBase64ByteLength,
  getSearchCurrentDate,
  getStepPlanAttachmentMimeType,
  normalizeSearchQuery
} from '../src/app/legacy-runtime/features/model-request-formatting.js';

const supportsVision = { modelSupportsVision: () => true };
const noVision = { modelSupportsVision: () => false };
const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('getSearchCurrentDate returns a stable prompt-safe date string', () => {
  const value = getSearchCurrentDate();

  assert.equal(typeof value, 'string');
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(`Current date: ${value}`, /^Current date: \d{4}-\d{2}-\d{2}$/);
});

test('Step Plan attachment MIME helper falls back to known filename extensions', () => {
  assert.equal(getStepPlanAttachmentMimeType({ mimeType: 'IMAGE/PNG', name: 'ignored.bin' }), 'image/png');
  assert.equal(getStepPlanAttachmentMimeType({ name: 'photo.jpeg' }), 'image/jpeg');
  assert.equal(getStepPlanAttachmentMimeType({ name: 'clip.MOV' }), 'video/quicktime');
  assert.equal(getStepPlanAttachmentMimeType({ name: 'archive.zip' }), '');
});

test('Step Plan base64 byte length helper handles padding and whitespace', () => {
  assert.equal(getBase64ByteLength('TWFu'), 3);
  assert.equal(getBase64ByteLength('TWE='), 2);
  assert.equal(getBase64ByteLength('TQ=='), 1);
  assert.equal(getBase64ByteLength(' T W F u \n'), 3);
  assert.equal(getBase64ByteLength(''), 0);
});

test('Step Plan attachment formatting mutates the provided content array', () => {
  const content = [{ type: 'text', text: 'Keep existing text' }];

  const result = appendStepPlanAttachmentContent(
    content,
    { mimeType: 'image/png', data: 'TWFu', name: 'image.png' },
    { name: 'Step Plan' },
    supportsVision
  );

  assert.equal(result, undefined);
  assert.equal(content.length, 2);
  assert.deepEqual(content[1], {
    type: 'image_url',
    image_url: {
      url: 'data:image/png;base64,TWFu',
      detail: 'high'
    }
  });
});

test('Step Plan attachment formatting preserves video size limit behavior', () => {
  const content = [];

  appendStepPlanAttachmentContent(
    content,
    {
      mimeType: 'video/mp4',
      data: 'TWFu',
      name: 'large.mp4',
      size: 128 * 1024 * 1024 + 1
    },
    { name: 'Step Plan' },
    supportsVision
  );

  assert.equal(content.length, 1);
  assert.equal(content[0].type, 'text');
  assert.match(content[0].text, /larger than 128MB/);
  assert.doesNotMatch(JSON.stringify(content), /video_url/);
});

test('Step Plan attachment formatting omits unsupported attachments for non-vision models', () => {
  const content = [];

  appendStepPlanAttachmentContent(
    content,
    { mimeType: 'image/png', data: 'TWFu', name: 'image.png' },
    { name: 'Text Only Model' },
    noVision
  );

  assert.deepEqual(content, [
    { type: 'text', text: '[Attachment omitted for Text Only Model: image.png]' }
  ]);
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
