import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles/chat.css', import.meta.url), 'utf8');

// A table wider than a phone scrolls sideways inside its container; without this its first column (what each row is) slid away with the rest and the rows could not be told apart.
test('the first column of a table in a message stays at the left while the table scrolls sideways', () => {
  const rule = css.match(/\.table-scroll-container th:first-child,\s*\.table-scroll-container td:first-child \{([^}]*)\}/);
  assert.ok(rule, 'the rule for the first column');
  const body = rule[1];
  assert.match(body, /position:\s*sticky;/);
  assert.match(body, /left:\s*-1px;/, 'one pixel past the edge, so the gap left by the collapsed border is covered');
  assert.match(body, /background-color:\s*var\(--modal-bg\);/, 'a solid background: what slides under it must not show through');
  assert.match(body, /min-width:\s*5\.5rem;/, 'wide enough to read');
  assert.match(body, /max-width:\s*12rem;/, 'and never wider than 12rem');
  assert.doesNotMatch(body, /z-index/, 'a positioned cell is painted over the cells that are not, so it needs no z-index');
  assert.match(body, /overflow-wrap:\s*break-word;/);
  assert.doesNotMatch(body, /overflow-wrap:\s*anywhere/, '"anywhere" lets the table squeeze the column to one letter');
});

test('the header and the tinted rows keep their tint over the solid background of the sticky cell, in the colours of the theme', () => {
  const tint = css.match(/\.table-scroll-container thead th:first-child,\s*\.table-scroll-container tr:nth-child\(even\) td:first-child \{([^}]*)\}/);
  assert.ok(tint);
  assert.match(tint[1], /background-image:\s*linear-gradient\(var\(--hover-bg\),\s*var\(--hover-bg\)\);/);
  const block = css.slice(css.indexOf('.table-scroll-container th:first-child'), css.indexOf('.prose ul, .prose ol'));
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'only the names of tokens.css');
});
