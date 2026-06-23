import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { formatFullTimestamp } from '../src/app/legacy-runtime/features/date-formatting.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('full timestamp formatting returns empty text for missing or empty input', () => {
  assert.equal(formatFullTimestamp(), '');
  assert.equal(formatFullTimestamp(''), '');
  assert.equal(formatFullTimestamp(null), '');
});

test('full timestamp formatting preserves the legacy local date format', () => {
  assert.equal(formatFullTimestamp('2026-06-03T04:05:30'), '2026-06-03 04:05');
});

test('full timestamp formatting pads month, day, hour, and minute', () => {
  assert.equal(formatFullTimestamp('2026-01-02T03:04:05'), '2026-01-02 03:04');
});

test('date formatting helper remains isolated from runtime side effects', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/date-formatting.js');

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
