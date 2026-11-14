import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/styles/sidebar.css', import.meta.url), 'utf8');

test('on a phone the left menu carries its own colour past its left edge, so a push to the right shows its grey and not the page', () => {
  const block = css.match(/@media \(max-width: 767\.98px\) \{\s*\.sidebar::before \{([^}]*)\}/);
  assert.ok(block, 'the extension of the menu is a rule of the phone width');
  const rule = block[1];
  assert.match(rule, /right:\s*100%/, 'it lies outside the left edge');
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /background:\s*inherit/, 'it has the menu\'s own colour, which a theme changes');
  assert.match(rule, /pointer-events:\s*none/, 'it takes no touch');
  assert.doesNotMatch(rule, /#[0-9a-f]{3,8}\b|rgb\(/i, 'no colour of its own');
});
