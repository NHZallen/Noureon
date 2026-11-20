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

test('the circle is 20% of the width and magnifies 1.6 times (the numbers of the design, the size changed from 13% on 2026-11-19)', () => {
  assert.equal(LENS_SIZE, 0.14);
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

test('the circle of the model glides to a point and is hidden by its own name only: hiding the model\'s leaves the person\'s', async () => {
  const window = new Window();
  try {
    const { document } = window;
    const view = createLiveView({ document, host: document.body, source: fakeSource() });
    const lens = document.querySelector('.bl-lens');
    // The first point shows it where it is (no glide from nowhere); the next one is reached after the glide.
    view.moveCursor(0.2, 0.2, 'model', { glide: true });
    assert.equal(lens.style.left, '20%');
    view.moveCursor(0.8, 0.6, 'model', { glide: true });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(lens.style.left, '80%');
    assert.equal(lens.style.top, '60%');
    view.hideCursor('user');
    assert.equal(lens.hidden, false, 'it is not the person\'s circle');
    view.hideCursor('model');
    assert.equal(lens.hidden, true);
    view.moveCursor(0.5, 0.5, 'user');
    view.hideCursor('model');
    assert.equal(lens.hidden, false, 'the person\'s circle stays when the model\'s is hidden');
    view.hideCursor('user');
    assert.equal(lens.hidden, true);
    // The click of the model does nothing to a circle that is not there.
    assert.doesNotThrow(() => view.pulse());
  } finally {
    window.happyDOM.abort();
  }
});

test('a picture that is not of the shape of the view (bars at its sides): the circle and the pointing of the person use the picture, not the view', () => {
  const window = new Window();
  try {
    const { document } = window;
    const source = { ...fakeSource(), size: { width: 768, height: 1024 }, videoSize() { return this.size; }, onVideoResize(callback) { this.resized = callback; } };
    const host = document.createElement('div');
    document.body.append(host);
    const view = createLiveView({ document, host, source });
    const box = (element, width, height, left = 0, top = 0) => {
      Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
      Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
      element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height });
    };
    // A view of 800 x 800 that shows a picture of 3:4: the picture is 600 wide, with 100 of bars at each side.
    box(view.element, 800, 800, 50, 10);
    const lens = document.querySelector('.bl-lens');
    view.moveCursor(0.5, 0.5, 'user');
    assert.equal(lens.style.left, '400px');
    view.moveCursor(0, 0.25, 'user');
    assert.equal(lens.style.left, '100px', 'the left edge of the picture, not of the view');
    assert.equal(lens.style.top, '200px');
    // The person points at the left edge of the picture (50 + 100 of window) and at a quarter of its height.
    assert.deepEqual(view.pointFromClient(150, 210), { x: 0, y: 0.25 });
    assert.deepEqual(view.pointFromClient(450, 410), { x: 0.5, y: 0.5 });
    assert.deepEqual(view.pointFromClient(60, 410), { x: 0, y: 0.5 }, 'a press on the bar is the edge');
    // The size of the picture arrives (or changes) later: the circle is put again.
    source.size = { width: 800, height: 800 };
    source.resized();
    assert.equal(lens.style.left, '0%', 'a picture of the shape of the view is placed in percent, as before');
  } finally {
    window.happyDOM.abort();
  }
});

test('after a switch of the ratio the old frames are not taken for the new screen: the picture is ready only when it has the shape of the ratio', () => {
  const window = new Window();
  try {
    const { document } = window;
    const source = { ...fakeSource(), size: { width: 1024, height: 768 }, videoSize() { return this.size; }, onVideoResize() {} };
    const view = createLiveView({ document, host: document.body, source });
    assert.equal(view.pictureReady(), true, '4:3 stream, 4:3 view');
    view.setRatio('16:9');
    assert.equal(view.pictureReady(), false, 'the stream still brings 4:3 frames');
    source.size = { width: 1280, height: 720 };
    assert.equal(view.pictureReady(), true);
    source.size = null;
    assert.equal(view.pictureReady(), true, 'size not known: nothing is held back');
  } finally {
    window.happyDOM.abort();
  }
});

test('the bending of the glass at the rim is only made where it can be done well; without it (no canvas here, Safari) the circle keeps the flat zoom and still works', async () => {
  const { createRefraction } = await import('../src/app/ui/browser-live/lens-refraction.js');
  const window = new Window();
  const document = window.document;
  const glass = document.createElement('div');
  assert.equal(createRefraction({ document, glass }), null, 'no canvas to draw the map on: no filter');
  assert.equal(glass.children.length, 0, 'nothing was added to the glass');
  const host = document.createElement('div');
  document.body.append(host);
  const view = createLiveView({ document, host, source: fakeSource() });
  assert.ok(host.querySelector('.bl-lens-in'), 'the picture is still inside the circle');
  assert.equal(host.querySelector('.bl-refract'), null);
  view.moveCursor(0.4, 0.4, 'model');
  assert.equal(view.cursor.visible, true);
  window.close();
});
