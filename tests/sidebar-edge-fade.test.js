import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The left menu fades only the end of its list, above the account row (src/styles/edge-fades.css); the owner chose to have no fade
// under the search row. The fade is a sticky strip inside the scroller. A sticky offset is measured from inside the scroller's
// padding, so the strip is offset by minus that padding to sit at the very edge of what is seen (with 0 it stuck one padding away
// and the list showed uncovered at the edge, 17.15.2). Strips laid over the scroller from the rows around it do not work on iPhone.

const css = readFileSync(new URL('../src/styles/edge-fades.css', import.meta.url), 'utf8');
const rule = (selector) => {
  const start = css.lastIndexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} is styled`);
  return css.slice(start, css.indexOf('}', start));
};

test('the end of the list fades with a sticky strip inside the scroller, at the very edge', () => {
  assert.match(rule('#sidebar > .scroll-area'), /padding-bottom:\s*var\(--menu-list-pad\)/);
  const strip = rule('#sidebar > .scroll-area::after');
  assert.match(strip, /position:\s*sticky/);
  assert.match(strip, /\n\s+bottom:\s*calc\(var\(--menu-list-pad\) \* -1\)/);
});

test('there is no fade under the search row, and no strip laid over the scroller from outside', () => {
  assert.doesNotMatch(css, /#sidebar > \.scroll-area::before/);
  assert.doesNotMatch(rule('#sidebar > .scroll-area'), /padding-top/);
  assert.doesNotMatch(css, /#sidebar > :first-child::after|#sidebar > :last-child::before/);
});
