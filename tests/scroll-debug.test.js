import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

// The tool that looks into a page that jumps while it is scrolled: it loads only with ?scrolldebug=1 and writes down the moves of the scroll that are too big to be a finger.

const run = (window, file) => window.eval(readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8'));

test('the tool is loaded only when the address asks for it', () => {
  const plain = new Window({ url: 'https://noureon.test/' });
  plain.document.body.innerHTML = '<div data-startup-skeleton></div>';
  run(plain, 'startup-language.js');
  assert.equal(plain.document.head.querySelector('script[src="/scroll-debug.js"]'), null);
  const asked = new Window({ url: 'https://noureon.test/?scrolldebug=1' });
  asked.document.body.innerHTML = '<div data-startup-skeleton></div>';
  run(asked, 'startup-language.js');
  assert.ok(asked.document.head.querySelector('script[src="/scroll-debug.js"]'));
});

test('a move of the scroll that is too big to be a finger is written down with what the page looked like; a slow one is not', () => {
  const window = new Window({ url: 'https://noureon.test/?scrolldebug=1' });
  window.document.body.innerHTML = '<div class="turnstile-widget"></div>';
  let y = 0;
  Object.defineProperty(window, 'scrollY', { get: () => y, configurable: true });
  run(window, 'scroll-debug.js');
  const scroll = (to) => { y = to; window.dispatchEvent(new window.Event('scroll')); };
  scroll(120);
  assert.equal((window.__scrollJumps || []).length, 0, 'a normal step');
  scroll(900);
  assert.equal(window.__scrollJumps.length, 1, 'a jump of 780 px between two events');
  assert.match(window.__scrollJumps[0], /120->900 \(780\)/);
  assert.match(window.__scrollJumps[0], /widget=/);
  assert.match(window.document.body.querySelector('pre').textContent, /1 jump/);
});
