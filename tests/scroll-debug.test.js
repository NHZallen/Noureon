import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

// The tool that looks into a page that jumps while it is scrolled: it loads only with ?scrolldebug=1 and writes down the moves of the scroll that are too big to be a finger.

const run = (window, file) => window.eval(readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8'));

test('the tool is loaded only when the address asks for it', async () => {
  const plain = new Window({ url: 'https://noureon.test/' });
  plain.document.body.innerHTML = '<div data-startup-skeleton></div>';
  run(plain, 'startup-language.js');
  assert.equal(plain.document.head.querySelector('script[src="/scroll-debug.js"]'), null);
  const asked = new Window({ url: 'https://noureon.test/?scrolldebug=1' });
  asked.document.body.innerHTML = '<div data-startup-skeleton></div>';
  run(asked, 'startup-language.js');
  assert.ok(asked.document.head.querySelector('script[src="/scroll-debug.js"]'));
  await Promise.all([plain.happyDOM.close(), asked.happyDOM.close()]);
});

test('a move of the scroll that is too big to be a finger is written down with the frames and events around it; a slow one is not', async () => {
  const window = new Window({ url: 'https://noureon.test/?scrolldebug=1' });
  window.document.body.innerHTML = '<div class="turnstile-widget"></div>';
  let y = 0;
  let docHeight = 3000;
  const frames = [];
  Object.defineProperty(window, 'scrollY', { get: () => y, configurable: true });
  Object.defineProperty(window.document.documentElement, 'scrollHeight', { get: () => docHeight, configurable: true });
  window.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  run(window, 'scroll-debug.js');
  const step = () => frames.splice(0).forEach((fn) => fn());
  const api = window.__scrollDebug;
  y = 120; step();
  assert.equal(api.reports.length, 0, 'a normal step');
  y = 900; step();
  assert.equal(api.reports.length, 1, 'a jump of 780 px in one frame');
  assert.match(api.text(), /scroll jump 780 px/);
  assert.match(api.text(), /security check height/);
  assert.match(api.text(), /frames \(ms scrollY/);
  docHeight = 3200; step();
  assert.equal(api.reports.length, 2, 'the page changed its height by itself');
  assert.match(api.reports[1].kind, /page height changed 200 px/);
  assert.match(window.document.body.textContent, /2 report\(s\)/);
  assert.ok([...window.document.body.querySelectorAll('button')].some((b) => /Copy/.test(b.textContent)), 'a button to copy');
  await window.happyDOM.close();
});
