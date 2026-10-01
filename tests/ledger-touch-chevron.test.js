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

test('a row that is closing (open while its part eases away) turns its chevron back at once', () => {
  assert.match(css, /\.ledger-row\[data-kind\]\[open\]:not\(\[data-closing\]\) > \.ledger-row-head\.is-expandable \.ledger-label::after/);
  const runCss = readFileSync(new URL('../src/styles/sandbox-run.css', import.meta.url), 'utf8');
  assert.match(runCss, /\.sandbox-run-details\[open\]:not\(\[data-closing\]\) > \.sandbox-run-summary::after/);
});

test('the file preview\'s close button has no focus ring, and a chat too short to scroll is one pixel taller than its scroller', () => {
  const cards = readFileSync(new URL('../src/styles/file-cards.css', import.meta.url), 'utf8');
  assert.match(cards, /\.ac-file-preview-close:focus,\s*\.ac-file-preview-close:focus-visible \{\s*outline: none;\s*box-shadow: none;\s*\}/);
  const edge = readFileSync(new URL('../src/styles/chat-edge-fade.css', import.meta.url), 'utf8');
  assert.match(edge, /#message-list \{\s*min-height: calc\(100% \+ 1px\);\s*\}/);
});
