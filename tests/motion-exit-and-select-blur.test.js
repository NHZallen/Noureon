import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { playExit } from '../src/app/ui/motion/exit-animation.js';
import { installSelectBlur } from '../src/app/ui/forms/select-blur.js';

const page = ({ reduced = false, canAnimate = true } = {}) => {
  const window = new Window();
  window.matchMedia = (query) => ({ matches: reduced && /reduce/.test(query) });
  const element = window.document.createElement('div');
  window.document.body.append(element);
  const calls = [];
  if (canAnimate) element.animate = (...args) => { calls.push(args); return {}; };
  return { window, element, calls };
};

test('the way out is played unless less motion was asked for, the keyboard started the change, or the browser cannot animate', () => {
  const frames = [{ opacity: 1 }, { opacity: 0 }];
  const normal = page();
  assert.equal(playExit(normal.element, frames, { duration: 200 }), true);
  assert.deepEqual(normal.calls[0][1], { duration: 200, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'none' });
  const reduced = page({ reduced: true });
  assert.equal(playExit(reduced.element, frames), false);
  const instant = page();
  instant.window.document.documentElement.classList.add('is-instant');
  assert.equal(playExit(instant.element, frames), false);
  assert.equal(playExit(page({ canAnimate: false }).element, frames), false);
});

test('choosing in a select takes the focus off it, and other fields are left alone', () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<select id="s"><option>a</option><option>b</option></select><input id="i">';
  installSelectBlur(document);
  const select = document.getElementById('s');
  const input = document.getElementById('i');
  select.focus();
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.notEqual(document.activeElement, select);
  input.focus();
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.activeElement, input);
});
