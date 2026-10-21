import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import test from 'node:test';

import {
  assertFileExists,
  assertFileWithinBudget,
  countLines,
  fileStats,
  projectFile,
  readSource
} from './helpers/source-guards.js';

const focusedStructureSuites = [
  ['tests', 'structure', 'shell-boundaries.test.js'],
  ['tests', 'structure', 'settings-helper-boundaries.test.js']
];

const focusedUiSuites = [
  ['tests', 'ui', 'settings-regressions.test.js'],
  ['tests', 'ui', 'composer-regressions.test.js'],
  ['tests', 'ui', 'sidebar-regressions.test.js'],
  ['tests', 'ui', 'council-media-regressions.test.js']
];

const focusedSuites = [
  ...focusedStructureSuites,
  ...focusedUiSuites
];

test('focused structure boundary suites exist', () => {
  focusedStructureSuites.forEach((segments) => {
    assertFileExists(assert, ...segments);
  });
});

test('focused UI regression suites exist', () => {
  focusedUiSuites.forEach((segments) => {
    assertFileExists(assert, ...segments);
  });
});

test('no test file grows back into a giant suite (the structure regressions of 245 KB became small files in NOU-74)', () => {
  assertFileWithinBudget(assert, ['tests', 'retired-code.test.js'], { maxBytes: 60000, maxLines: 1000 });
  assertFileWithinBudget(assert, ['tests', 'ui-regressions.test.js'], { maxBytes: 5000, maxLines: 120 });
});

test('shared source guard helper exposes file lookup, source reading, and budget utilities', () => {
  const helperSource = readSource('tests', 'helpers', 'source-guards.js');

  assert.match(helperSource, /export function projectFile/);
  assert.match(helperSource, /export function readSource/);
  assert.match(helperSource, /export function countLines/);
  assert.match(helperSource, /export function fileStats/);
  assert.match(helperSource, /export function assertFileWithinBudget/);
  assert.match(helperSource, /export function assertSourceContains/);
  assert.match(helperSource, /export function assertSourceDoesNotContain/);
  assert.match(helperSource, /export function collectCssSelectorHits/);
  assert.equal(countLines('one\ntwo'), 2);
  assert.equal(typeof fileStats('tests', 'ui-regressions.test.js').bytes, 'number');
});

test('focused guard suites do not statically import the production runtime entry', () => {
  const productionEntryImportPattern = /import\s+[^;]*from\s+['"][^'"]*src\/app\/runtime-entry\.js['"]/;

  focusedSuites.forEach((segments) => {
    const source = readSource(...segments);
    assert.doesNotMatch(
      source,
      productionEntryImportPattern,
      `${segments.join('/')} should inspect boundaries without importing runtime-entry.js`
    );
  });
});

test('hygiene suite remains test-only and inert', () => {
  const source = readSource('tests', 'test-suite-hygiene.test.js');

  assert.doesNotMatch(source, /from\s+['"][^'"]*src\//);
  assert.doesNotMatch(source, /\bbuild\b\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test('check:sizes reports grouped budgets without using targets as hard failures', () => {
  const source = readSource('scripts', 'check-file-sizes.mjs');
  const output = execFileSync('node', ['scripts/check-file-sizes.mjs'], {
    encoding: 'utf8'
  });

  assert.match(output, /# Grouped size budget report/);
  assert.match(output, /Runtime source budgets: PASS/);
  assert.match(output, /CSS budgets: PASS/);
  assert.match(output, /Test file budgets: PASS/);
  if (existsSync(projectFile('dist'))) {
    assert.match(output, /Build output budgets: PASS/);
  } else {
    assert.doesNotMatch(output, /Build output budgets:/);
  }
  assert.match(output, /dist\/ is ignored as review source and reported only as generated build output when present\./);
  // Every budget shows its long-term target; one above it is reported as debt, not as a failure.
  assert.match(output, /\/ target [\d.]+ KB/);
  assert.match(output, /OK: all grouped size budgets are within transitional limits/);
  assert.match(source, /Hard failures use transitional limits/);
  const shellBudget = /label:\s*'shell'[^}]*transitionalLimit:\s*bytes\((\d+)\)[^}]*v5Target:\s*bytes\(55\)/.exec(source);
  assert.ok(shellBudget, 'the shell keeps its long-term target');
  assert.ok(Number(shellBudget[1]) <= 55, 'the shell budget stays ratcheted down to the long-term target');
  assert.match(source, /status\s*=\s*overTransitional[\s\S]*overTarget[\s\S]*'DEBT'/);
  assert.doesNotMatch(source, /process\.exit\(1\)[\s\S]{0,120}overTarget/);
});

test('size checks keep dist out of review source and report it only as build output', () => {
  const checkSizesSource = readSource('scripts', 'check-file-sizes.mjs');

  assert.match(checkSizesSource, /ignoredSourceDirectories\s*=\s*new Set\(\['node_modules',\s*'dist'\]\)/);
  assert.match(checkSizesSource, /Build output budgets/);
  assert.match(checkSizesSource, /join\(root,\s*'dist'\)/);
});
