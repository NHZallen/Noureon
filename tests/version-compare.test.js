import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareVersions } from '../src/app/legacy-runtime/features/version-compare.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

test('version compare returns 1 when the first version is newer', () => {
  assert.equal(compareVersions('16.4.5', '16.4.4'), 1);
  assert.equal(compareVersions('16.10.0', '16.9.9'), 1);
});

test('version compare returns 0 for equal versions', () => {
  assert.equal(compareVersions('16.4.5', '16.4.5'), 0);
});

test('version compare returns -1 when the first version is older', () => {
  assert.equal(compareVersions('16.4.4', '16.4.5'), -1);
});

test('version compare preserves the legacy missing segment behavior', () => {
  assert.equal(compareVersions('16.4', '16.4.0'), 0);
  assert.equal(compareVersions('16.4.1', '16.4'), 1);
  assert.equal(compareVersions('16.4', '16.4.1'), -1);
});

test('version compare preserves the legacy missing v2 behavior', () => {
  assert.equal(compareVersions('16.4.5'), 1);
  assert.equal(compareVersions('16.4.5', ''), 1);
  assert.equal(compareVersions('16.4.5', null), 1);
});

test('version compare helper remains side-effect free', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/version-compare.js');

  for (const forbidden of [
    'document',
    'window',
    'globalThis',
    'localStorage',
    'fetch',
    'addEventListener'
  ]) {
    assert.doesNotMatch(helperSource, new RegExp(`\\b${forbidden}\\b`));
  }
});
