import assert from 'node:assert/strict';
import test from 'node:test';
import postcss from 'postcss';
import hoverOnly from '../scripts/postcss-hover-only.mjs';

const run = async (css) => (await postcss([hoverOnly()]).process(css, { from: undefined })).css;
const squash = (css) => css.replace(/\s+/g, ' ').replace(/\{ ?/g, '{ ').replace(/ ?\}/g, ' }').replace(/\{  /g, '{ ').replace(/\}@media/g, '} @media').trim();

test('a plain :hover rule moves into the hover media query', async () => {
  const out = squash(await run('.a:hover { color: red; }'));
  assert.equal(out, '@media (hover: hover) { .a:hover { color: red; } }');
});

test('only the hover selectors of a mixed rule move; the others stay put', async () => {
  const out = squash(await run('.a:hover, .b.active { color: red; }'));
  assert.equal(out, '.b.active { color: red; } @media (hover: hover) { .a:hover { color: red; } }');
});

test('rules already inside a hover media query, :not(:hover) rules and keyframes are left alone', async () => {
  const already = '@media (hover: hover) { .a:hover { color: red; } }';
  assert.equal(squash(await run(already)), squash(already));
  const notHover = '.a:not(:hover) { color: red; }';
  assert.equal(squash(await run(notHover)), squash(notHover));
  const frames = '@keyframes k { from { opacity: 0; } to { opacity: 1; } }';
  assert.equal(squash(await run(frames)), squash(frames));
});

test('hover rules inside another media query keep it and nest the hover query', async () => {
  const out = squash(await run('@media (min-width: 769px) { .a:hover { color: red; } .c { top: 0; } }'));
  assert.equal(out, '@media (min-width: 769px) { @media (hover: hover) { .a:hover { color: red; } } .c { top: 0; } }');
});
