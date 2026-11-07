import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { lockAxisScroll } from '../src/app/ui/files/previews/axis-lock-scroll.js';

// A finger on a sheet moves it one axis at a time: the one it goes along first.

function setup({ wide = true, tall = true } = {}) {
  const window = new Window();
  const { document } = window;
  const grid = document.createElement('div');
  document.body.append(grid);
  Object.defineProperty(grid, 'scrollWidth', { value: wide ? 1000 : 100, configurable: true });
  Object.defineProperty(grid, 'clientWidth', { value: 100, configurable: true });
  Object.defineProperty(grid, 'scrollHeight', { value: tall ? 1000 : 100, configurable: true });
  Object.defineProperty(grid, 'clientHeight', { value: 100, configurable: true });
  grid.scrollLeft = 0; grid.scrollTop = 0;
  const off = lockAxisScroll(grid);
  const fire = (type, x, y, touches = 1) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    event.touches = type === 'touchend' ? [] : Array.from({ length: touches }, () => ({ clientX: x, clientY: y }));
    grid.dispatchEvent(event);
    return event;
  };
  return { window, grid, off, fire };
}

test('a finger that goes mostly sideways moves the sheet sideways only, and the browser does not scroll it', async () => {
  const t = setup();
  t.fire('touchstart', 200, 200);
  t.fire('touchmove', 190, 201); // 10 px sideways: the axis is chosen (x)
  const move = t.fire('touchmove', 150, 230); // goes down too: the vertical part is ignored
  assert.equal(move.defaultPrevented, true);
  assert.equal(t.grid.scrollTop, 0);
  assert.ok(t.grid.scrollLeft > 0);
  t.fire('touchend');
  t.off();
  await t.window.happyDOM.abort();
});

test('a finger that goes mostly up and down moves it up and down only', async () => {
  const t = setup();
  t.fire('touchstart', 200, 200);
  t.fire('touchmove', 201, 190);
  t.fire('touchmove', 230, 150);
  assert.equal(t.grid.scrollLeft, 0);
  assert.ok(t.grid.scrollTop > 0);
  t.off();
  await t.window.happyDOM.abort();
});

test('an axis with nothing to move is left to the browser, two fingers are not touched, and taking it away stops it', async () => {
  const flat = setup({ tall: false });
  flat.fire('touchstart', 200, 200);
  flat.fire('touchmove', 201, 190);
  const free = flat.fire('touchmove', 202, 150);
  assert.equal(free.defaultPrevented, false, 'the window behind may scroll');
  flat.off();
  const t = setup();
  t.fire('touchstart', 200, 200, 2);
  assert.equal(t.fire('touchmove', 150, 200, 2).defaultPrevented, false);
  t.fire('touchstart', 200, 200);
  t.off();
  assert.equal(t.fire('touchmove', 150, 200).defaultPrevented, false, 'after it is taken away the browser has the touch again');
  await flat.window.happyDOM.abort();
  await t.window.happyDOM.abort();
});
