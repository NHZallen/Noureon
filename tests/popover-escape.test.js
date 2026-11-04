import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { collapseTriggers, installPopoverEscape } from '../src/app/runtime/features/popover-escape.js';

const page = () => {
  const window = new Window();
  window.document.body.innerHTML = '<button id="add-file-btn" aria-expanded="true"></button><div id="model-council-control"><button class="mp-trigger" aria-expanded="true"></button><button class="mp-trigger" aria-expanded="false"></button></div><div id="menu" class="popover visible"></div>';
  return window;
};
const press = (window, key) => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('the buttons that opened a popover read as folded again, the attachment button too', () => {
  const window = page();
  collapseTriggers(window.document);
  assert.equal(window.document.getElementById('add-file-btn').getAttribute('aria-expanded'), 'false');
  assert.deepEqual([...window.document.querySelectorAll('.mp-trigger')].map((node) => node.getAttribute('aria-expanded')), ['false', 'false']);
});

test('Escape closes the popovers that are open, and does nothing when none is open or for another key', () => {
  const window = page();
  let closed = 0;
  installPopoverEscape({ document: window.document, closeAll: () => { closed += 1; window.document.getElementById('menu').classList.remove('visible'); } });
  press(window, 'Enter');
  assert.equal(closed, 0);
  press(window, 'Escape');
  assert.equal(closed, 1);
  press(window, 'Escape');
  assert.equal(closed, 1, 'nothing is open any more');
});

test('Escape that something else took (defaultPrevented) is left alone, and the listener can be taken away', () => {
  const window = page();
  let closed = 0;
  const stop = installPopoverEscape({ document: window.document, closeAll: () => { closed += 1; } });
  window.document.addEventListener('keydown', (event) => event.preventDefault(), true);
  press(window, 'Escape');
  assert.equal(closed, 0);
  stop();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(closed, 0);
});
