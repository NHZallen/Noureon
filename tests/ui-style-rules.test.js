import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The style rules (docs/superpowers/specs/2026-10-31-ui-style-rules.md) for the style files of the pages that follow them: no weight above 500, no colour of its own (only the names of
// tokens.css), no heading elements (the page forces them to the bold weight). A new page is added to the list.
const FILES = ['src/styles/projects.css', 'src/styles/projects-wide.css'];

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

for (const file of FILES) {
  const css = stripComments(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

  test(`${file}: no weight above 500`, () => {
    const heavy = [...css.matchAll(/font-weight\s*:\s*([^;}]+)/g)].map((match) => match[1].trim()).filter((value) => /^(bold|bolder|[6-9]00)$/i.test(value));
    assert.deepEqual(heavy, []);
  });

  test(`${file}: no colour of its own`, () => {
    assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g) || [], [], 'a hex colour');
    assert.deepEqual(css.match(/\b(?:rgba?|hsla?)\(/g) || [], [], 'rgb() or hsl()');
  });

  test(`${file}: no h1 to h6, strong, b or label selector`, () => {
    const selectors = [...css.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((match) => match[2]);
    const used = selectors.filter((selector) => /(^|[\s>+~,(])(h[1-6]|strong|b|label)(?![\w-])/.test(selector));
    assert.deepEqual(used, []);
  });
}

test('Google\'s file picker is above the pages and the sheets of the projects', () => {
  const css = stripComments(readFileSync(new URL('../src/styles/projects.css', import.meta.url), 'utf8'));
  const layer = (selector) => Number(new RegExp(`${selector.replace(/[.>]/g, '\\$&')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css)?.[1]);
  const highest = Math.max(...[...css.matchAll(/z-index:\s*(\d+)/g)].map((match) => Number(match[1])).filter((value) => value < 1300));
  assert.ok(layer('body > .picker-dialog-bg') > highest, 'the dim layer of the picker');
  assert.ok(layer('body > .picker-dialog') > layer('body > .picker-dialog-bg'), 'the picker itself');
});
