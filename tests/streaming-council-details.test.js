import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createDom } from './behaviours/helpers/create-dom.js';
import {
  getOpenCouncilDetailKeys,
  hasUnclosedCouncilDetails,
  isCouncilComparisonSummary,
  normalizeCouncilComparisonDetails,
  restoreOpenCouncilDetails
} from '../src/app/legacy-runtime/features/streaming-council-details.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('captures and restores open council detail sections by summary text', () => {
  const { document, cleanup } = createDom(`
    <article id="target">
      <details class="council-collapse" open>
        <summary>Consensus</summary>
        <p>Open section</p>
      </details>
      <details class="council-collapse">
        <summary>Differences</summary>
        <p>Closed section</p>
      </details>
    </article>
  `);

  try {
    const target = document.getElementById('target');
    const openKeys = getOpenCouncilDetailKeys(target);

    assert.deepEqual([...openKeys], ['Consensus']);

    target.querySelectorAll('details').forEach((detail) => {
      detail.open = false;
    });
    restoreOpenCouncilDetails(target, openKeys);

    assert.equal(target.querySelector('details').open, true);
    assert.equal(target.querySelectorAll('details')[1].open, false);
  } finally {
    cleanup();
  }
});

test('recognizes council comparison summaries used by streaming preservation', () => {
  assert.equal(isCouncilComparisonSummary('Consensus'), true);
  assert.equal(isCouncilComparisonSummary('Key Differences'), true);
  assert.equal(isCouncilComparisonSummary('Model A response'), false);
});

test('moves stray comparison table lines back inside the comparison details block', () => {
  const source = [
    '<p>Intro</p>',
    '<details class="council-collapse">',
    '<summary>Consensus and Differences</summary>',
    '<p>Inside</p>',
    '</details>',
    '',
    '| Model | View |',
    '| --- | --- |',
    '| A | B |',
    '',
    '<details class="council-collapse">',
    '<summary>Next section</summary>',
    '<p>Later</p>',
    '</details>'
  ].join('\n');

  const normalized = normalizeCouncilComparisonDetails(source);

  assert.match(
    normalized,
    /<p>Inside<\/p>\n\n\| Model \| View \|\n\| --- \| --- \|\n\| A \| B \|\n<\/details>/
  );
  assert.match(normalized, /<summary>Next section<\/summary>/);
});

test('leaves non-comparison details text unchanged', () => {
  const source = [
    '<details class="council-collapse">',
    '<summary>Regular section</summary>',
    '<p>Inside</p>',
    '</details>',
    '',
    '| Not | moved |'
  ].join('\n');

  assert.equal(normalizeCouncilComparisonDetails(source), source);
});

test('detects incomplete council details markup', () => {
  assert.equal(hasUnclosedCouncilDetails('<details class="council-collapse"><summary>A</summary>'), true);
  assert.equal(
    hasUnclosedCouncilDetails('<details class="council-collapse"><summary>A</summary></details>'),
    false
  );
});

test('streaming council details helper stays isolated from high-risk runtime side effects', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/streaming-council-details.js');

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
    'innerHTML',
    'classList',
    'renderMarkdown',
    'renderMarkdownWithFormulas',
    'requestAnimationFrame',
    'setTimeout'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`));
  }
});
