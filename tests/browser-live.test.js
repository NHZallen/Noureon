import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { cssRatio, DEFAULT_RATIO, isRatio, ratioOf, RATIOS } from '../src/app/ui/browser-live/ratios.js';
import { createLiveView, LENS_SIZE, LENS_ZOOM } from '../src/app/ui/browser-live/live-view.js';

const fakeSource = () => {
  const log = [];
  return {
    log,
    mount(el) { log.push('mount'); el.append(Object.assign(el.ownerDocument.createElement('div'), { className: 'fake-pic' })); },
    mountLens(el) { log.push('lens'); el.append(Object.assign(el.ownerDocument.createElement('div'), { className: 'fake-lens-pic' })); },
    destroy() { log.push('destroy'); }
  };
};

test('the ratios: 4:3 is the default, 16:9 and the upright one are the others, and an unknown one is 4:3', () => {
  assert.equal(DEFAULT_RATIO, '4:3');
  assert.deepEqual(Object.keys(RATIOS), ['4:3', '16:9', 'portrait']);
  assert.deepEqual(ratioOf('4:3'), { width: 1024, height: 768 });
  assert.deepEqual(ratioOf('16:9'), { width: 1280, height: 720 });
  assert.deepEqual(ratioOf('portrait'), { width: 768, height: 1024 });
  assert.deepEqual(ratioOf('nonsense'), { width: 1024, height: 768 });
  assert.equal(isRatio('16:9'), true);
  assert.equal(isRatio('toString'), false, 'a key of the prototype is not a ratio');
  assert.equal(cssRatio('portrait'), '768 / 1024');
});

test('the circle is 13% of the width and magnifies 1.6 times (the numbers of the design)', () => {
  assert.equal(LENS_SIZE, 0.13);
  assert.equal(LENS_ZOOM, 1.6);
});

test('the view draws the picture and a second copy of it inside the circle; setting another source lets the first go', () => {
  const window = new Window();
  try {
    const { document } = window;
    const first = fakeSource();
    const view = createLiveView({ document, host: document.body, source: first });
    assert.ok(document.querySelector('.bl-picture .fake-pic'));
    assert.ok(document.querySelector('.bl-lens-in .fake-lens-pic'));
    assert.equal(view.lensMounted, true);
    const second = fakeSource();
    view.setSource(second);
    assert.deepEqual(first.log, ['mount', 'lens', 'destroy']);
    assert.equal(document.querySelectorAll('.fake-pic').length, 1);
    view.destroy();
    assert.ok(second.log.includes('destroy'));
  } finally {
    window.happyDOM.abort();
  }
});

test('the circle is hidden until a point is given, stays inside the screen, and is the person\'s when they point', () => {
  const window = new Window();
  try {
    const { document } = window;
    const view = createLiveView({ document, host: document.body, source: fakeSource() });
    const lens = document.querySelector('.bl-lens');
    assert.equal(lens.hidden, true);
    view.moveCursor(0.25, 0.5);
    assert.equal(lens.hidden, false);
    assert.equal(lens.style.left, '25%');
    assert.equal(lens.style.top, '50%');
    assert.equal(lens.classList.contains('is-user'), false);
    view.moveCursor(3, -2, 'user');
    assert.deepEqual({ x: view.cursor.x, y: view.cursor.y }, { x: 1, y: 0 });
    assert.equal(lens.classList.contains('is-user'), true);
    view.press(true);
    assert.equal(lens.classList.contains('is-pressed'), true);
    view.press(false);
    assert.equal(lens.classList.contains('is-pressed'), false);
    view.hideCursor();
    assert.equal(lens.hidden, true);
  } finally {
    window.happyDOM.abort();
  }
});

test('a ratio set on the view changes its shape and is kept', () => {
  const window = new Window();
  try {
    const { document } = window;
    const view = createLiveView({ document, host: document.body });
    assert.equal(view.element.style.aspectRatio, '1024 / 768');
    view.setRatio('portrait');
    assert.equal(view.element.style.aspectRatio, '768 / 1024');
    assert.equal(view.element.dataset.ratio, 'portrait');
  } finally {
    window.happyDOM.abort();
  }
});
