import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { highlightText } from '../src/app/legacy-runtime/features/search-text-formatting.js';

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const readSource = (path) => readFileSync(projectFile(path), 'utf8');

const mark = (text) => `<mark class="conversation-search-match">${text}</mark>`;

test('search highlight returns original text for an empty query', () => {
  assert.equal(highlightText('Alpha beta', ''), 'Alpha beta');
  assert.equal(highlightText('Alpha beta', null), 'Alpha beta');
});

test('search highlight returns original text for empty text', () => {
  assert.equal(highlightText('', 'alpha'), '');
  assert.equal(highlightText(null, 'alpha'), null);
});

test('search highlight escapes query regex metacharacters', () => {
  assert.doesNotThrow(() => highlightText('Use a+b? then a+b?', 'a+b?'));
  assert.equal(
    highlightText('Use a+b? then a+b?', 'a+b?'),
    `Use ${mark('a+b?')} then ${mark('a+b?')}`
  );
});

test('search highlight is case-insensitive and preserves matched casing', () => {
  assert.equal(
    highlightText('Alpha beta ALPHA', 'alpha'),
    `${mark('Alpha')} beta ${mark('ALPHA')}`
  );
});

test('search highlight replaces every occurrence like the legacy global regex', () => {
  assert.equal(
    highlightText('one fish, two fish, red fish', 'fish'),
    `one ${mark('fish')}, two ${mark('fish')}, red ${mark('fish')}`
  );
});

test('search highlight preserves the legacy regex error logging fallback', () => {
  const originalError = console.error;
  const calls = [];
  console.error = (...args) => {
    calls.push(args);
  };

  try {
    assert.equal(highlightText('Alpha beta', {}), 'Alpha beta');
  } finally {
    console.error = originalError;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'Highlight regex error:');
  assert.ok(calls[0][1] instanceof TypeError);
});

test('search text formatting helper remains side-effect free', () => {
  const helperSource = readSource('src/app/legacy-runtime/features/search-text-formatting.js');

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
  assert.doesNotMatch(helperSource, /yellow|bg-yellow/);
});

test('search highlight never lets the text of a conversation become markup', () => {
  assert.equal(highlightText('<img src=x onerror=alert(1)>', ''), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(
    highlightText('<img src=x onerror=alert(1)> cat', 'cat'),
    `&lt;img src=x onerror=alert(1)&gt; ${mark('cat')}`
  );
  assert.equal(highlightText('a <b> c', 'b'), `a &lt;${mark('b')}&gt; c`, 'the match is inside text, not a tag');
  assert.equal(highlightText('fish & chips', 'amp'), 'fish &amp; chips', 'a query cannot cut an entity in two');
  assert.equal(highlightText('x "quoted" \'y\'', 'quoted'), `x &quot;${mark('quoted')}&quot; &#39;y&#39;`);
  assert.equal(highlightText('<b>', 'zzz'), '&lt;b&gt;', 'no match: still escaped');
  assert.equal(highlightText('<b>', '<b>'), mark('&lt;b&gt;'), 'a query with markup in it is matched as text');
});
