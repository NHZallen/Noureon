import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles/ledger.css', import.meta.url), 'utf8');

test('on a touch screen a row that opens shows its chevron shut as well as open; with a pointer it shows on hover', () => {
  const touch = /@media \(hover: none\) \{\s*\.ledger-row\[data-kind\] > \.ledger-row-head\.is-expandable \.ledger-label::after \{ opacity: 1; \}\s*\}/;
  assert.match(css, touch);
  assert.match(css, /@media \(hover: hover\) \{[\s\S]*?\.is-expandable:hover \.ledger-label::after \{ opacity: 1; \}/);
  // Open, it points down; the touch rule only turns it on, so it does not undo that.
  const open = css.lastIndexOf("[aria-expanded='true'] .ledger-label::after");
  assert.ok(open > css.search(touch), 'the open rule comes after and sets the turn');
});
