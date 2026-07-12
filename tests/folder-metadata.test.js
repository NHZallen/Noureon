import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FOLDER_SVGS,
  FOLDER_TEXT_COLORS
} from '../src/app/legacy-runtime/data/folder-metadata.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('folder metadata exports the legacy keys in order', () => {
  assert.deepEqual(Object.keys(FOLDER_SVGS), [
    'default',
    'open',
    'archive',
    'user',
    'star',
    'cloud',
    'work',
    'tag',
    'heart',
    'lightning',
    'book',
    'code'
  ]);
  assert.deepEqual(Object.keys(FOLDER_TEXT_COLORS), ['gray', 'black', 'white']);
});

test('folder SVG metadata preserves exact legacy values', () => {
  assert.equal(
    FOLDER_SVGS.default,
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />'
  );
  assert.equal(
    FOLDER_SVGS.star,
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />'
  );
  assert.equal(
    FOLDER_SVGS.lightning,
    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />'
  );
});

test('folder SVG metadata includes safe rounded outline book and code icons', () => {
  for (const key of ['book', 'code']) {
    const markup = FOLDER_SVGS[key];

    assert.match(markup, /^<(?:path|g)\b/);
    assert.match(markup, /stroke-linecap="round"/);
    assert.match(markup, /stroke-linejoin="round"/);
    assert.doesNotMatch(markup, /<svg|<script|onload\s*=|onclick\s*=/i);
  }
});

test('folder text color metadata preserves exact legacy values', () => {
  assert.deepEqual(FOLDER_TEXT_COLORS, {
    gray: '#6b7280',
    black: '#111827',
    white: '#ffffff'
  });
});

test('folder runtime palettes include the seven expanded icon colors', () => {
  const runtimeSource = readSource('src/app/runtime/legacy-core/legacy-core.js');
  const historyMenuSource = readSource('src/app/runtime/legacy-core/settings-history-menu-helper.js');
  const addedFolderColors = {
    orange: '#fb923c',
    amber: '#fbbf24',
    lime: '#a3e635',
    emerald: '#34d399',
    teal: '#2dd4bf',
    cyan: '#22d3ee',
    rose: '#fb7185'
  };

  for (const [key, value] of Object.entries(addedFolderColors)) {
    const entryPattern = new RegExp(`\\b${key}\\s*:\\s*['"]${value}['"]`);
    assert.match(runtimeSource, entryPattern);
    assert.match(historyMenuSource, entryPattern);
  }
});

test('folder metadata remains plain mutable objects without runtime responsibilities', () => {
  const source = readSource('src/app/legacy-runtime/data/folder-metadata.js');

  assert.equal(Object.getPrototypeOf(FOLDER_SVGS), Object.prototype);
  assert.equal(Object.getPrototypeOf(FOLDER_TEXT_COLORS), Object.prototype);
  assert.equal(Object.isFrozen(FOLDER_SVGS), false);
  assert.equal(Object.isFrozen(FOLDER_TEXT_COLORS), false);
  assert.doesNotMatch(source, /Object\.freeze|document|window|globalThis|ALL_ELEMENTS/);
  assert.doesNotMatch(source, /config|conversations|folders|localStorage|sessionStorage|indexedDB|fetch/i);
  assert.doesNotMatch(source, /setTimeout|setInterval|requestAnimationFrame|addEventListener/);
});
