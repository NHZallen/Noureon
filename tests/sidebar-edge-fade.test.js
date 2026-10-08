import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The left menu fades its list at the top and the bottom with sticky strips inside the scroller (src/styles/edge-fades.css). A sticky
// offset is measured from inside the scroller's padding, so the strips must be offset by minus that padding to sit at the very edge of
// what is seen; with top: 0 (17.15.2) the strip stuck one padding below the edge and the list showed, uncovered, under the search row.
// Strips laid over the scroller from the rows around it do not work on iPhone (the scroller is drawn above them).

const css = readFileSync(new URL('../src/styles/edge-fades.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const start = css.lastIndexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} is styled`);
  return css.slice(start, css.indexOf('}', start));
};

test('the strips are inside the scroller and stick at the very edges', () => {
  const scroller = rule('#sidebar > .scroll-area');
  assert.match(scroller, /padding-top:\s*var\(--menu-list-pad\)/);
  assert.match(scroller, /padding-bottom:\s*var\(--menu-list-pad\)/);
  const shared = rule('#sidebar > .scroll-area::before,\n#sidebar > .scroll-area::after');
  assert.match(shared, /position:\s*sticky/);
  assert.match(rule('#sidebar > .scroll-area::before'), /\n\s+top:\s*calc\(var\(--menu-list-pad\) \* -1\)/);
  assert.match(rule('#sidebar > .scroll-area::after'), /\n\s+bottom:\s*calc\(var\(--menu-list-pad\) \* -1\)/);
});

test('no strip is laid over the scroller from the search row or the account row', () => {
  assert.doesNotMatch(css, /#sidebar > :first-child::after|#sidebar > :last-child::before/);
});
