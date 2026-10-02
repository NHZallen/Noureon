import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { trackPointedRow } from '../src/app/ui/scroll/pointed-row.js';

function scene() {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<div id="list"><a class="row" id="r1">one</a><a class="row" id="r2">two</a><a class="row" id="r3">three</a></div>';
  const list = document.getElementById('list');
  // Which row is at the pointer depends on how far the list has scrolled: the test moves it by hand.
  const at = { id: 'r1' };
  document.elementFromPoint = () => (at.id ? document.getElementById(at.id) : null);
  const frames = [];
  window.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  const settle = () => { for (const frame of frames.splice(0)) frame(0); };
  const marked = () => [...list.querySelectorAll('.is-pointed')].map((node) => node.id);
  return { window, document, list, at, settle, marked };
}

test('the row under the pointer is marked as the pointer moves, and unmarked when it leaves', () => {
  const { window, list, at, marked } = scene();
  try {
    trackPointedRow(list, '.row');
    list.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }));
    assert.deepEqual(marked(), ['r1']);
    at.id = 'r2';
    list.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 40 }));
    assert.deepEqual(marked(), ['r2']);
    list.dispatchEvent(new window.MouseEvent('pointerleave'));
    assert.deepEqual(marked(), []);
  } finally {
    window.close();
  }
});

test('while the list scrolls under a still pointer the mark follows the rows at once', () => {
  const { window, list, at, settle, marked } = scene();
  try {
    trackPointedRow(list, '.row');
    list.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }));
    assert.deepEqual(marked(), ['r1']);
    // The list scrolls: another row is under the pointer, and the browser has not said so yet.
    at.id = 'r3';
    list.dispatchEvent(new window.Event('scroll'));
    settle();
    assert.deepEqual(marked(), ['r3']);
    // Scrolled so that nothing is under it.
    at.id = null;
    list.dispatchEvent(new window.Event('wheel'));
    settle();
    assert.deepEqual(marked(), []);
  } finally {
    window.close();
  }
});

test('a finger leaves no row marked', () => {
  const { window, list, marked } = scene();
  try {
    trackPointedRow(list, '.row');
    const touch = new window.MouseEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 });
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    list.dispatchEvent(touch);
    assert.deepEqual(marked(), []);
  } finally {
    window.close();
  }
});
