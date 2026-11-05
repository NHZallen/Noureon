import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Window } from 'happy-dom';

import { installHomeScroll } from '../src/app/ui/home/home-scroll.js';

// The home page is laid out in a height it takes once (--hv), not in svh/vh: the Google app on an iPhone resizes those with its bar, and the page grew and shrank by 1500 px while it was scrolled.

test('the home page is laid out in --hv: the height is kept when the bar shows and hides, and only made smaller', async () => {
  const window = new Window({ url: 'https://noureon.test/', width: 393, height: 633 });
  window.document.body.innerHTML = '<div id="c"><div class="hm-story"></div></div>';
  const container = window.document.getElementById('c');
  Object.defineProperty(window.document.documentElement, 'clientHeight', { get: () => window.innerHeight, configurable: true });
  window.requestAnimationFrame = () => 0;
  const stop = installHomeScroll({ window, document: window.document, container });
  assert.equal(container.style.getPropertyValue('--hv'), '6.33px');
  window.innerHeight = 771;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(container.style.getPropertyValue('--hv'), '6.33px', 'the bar going away does not stretch the page');
  window.innerHeight = 600;
  window.dispatchEvent(new window.Event('resize'));
  assert.equal(container.style.getPropertyValue('--hv'), '6px');
  stop();
  await window.happyDOM.close();
});

test('the stylesheet of the home page has no height of its own in svh or vh', () => {
  const css = readFileSync(new URL('../public/home.css', import.meta.url), 'utf8');
  const bare = css.replace(/var\(--hv,[^)]*\)/g, '');
  assert.equal(/\d\s*s?vh\b/.test(bare), false, 'every vh is written through var(--hv, …)');
});
