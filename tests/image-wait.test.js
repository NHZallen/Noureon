import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { IMAGE_WAIT_STAGE_STARTS, createImageWait, dotIntensity, drawDots, stageForElapsed } from '../src/app/ui/image-wait/image-wait.js';
import { imageWaitMarkup } from '../src/app/ui/image-wait/image-wait-markup.js';
import i18n from '../src/data/i18n/index.js';

test('the words go through four stages as the time passes, and the last says that it is taking long', () => {
  assert.deepEqual(IMAGE_WAIT_STAGE_STARTS, [0, 6, 16, 40]);
  assert.equal(stageForElapsed(0), 0);
  assert.equal(stageForElapsed(5.9), 0);
  assert.equal(stageForElapsed(6), 1);
  assert.equal(stageForElapsed(15.99), 1);
  assert.equal(stageForElapsed(16), 2);
  assert.equal(stageForElapsed(39), 2);
  assert.equal(stageForElapsed(40), 3);
  assert.equal(stageForElapsed(900), 3, 'it stays there however long it takes');
  assert.equal(stageForElapsed(-3), 0);
});

test('the four lines of the stages are in every language, and none of them promises a percentage or a time', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of ['imageWaitStage1', 'imageWaitStage2', 'imageWaitStage3', 'imageWaitStage4']) {
      const text = i18n[language][key];
      assert.equal(typeof text, 'string', `${language} ${key}`);
      assert.ok(text.length > 3, `${language} ${key} is not empty`);
      assert.doesNotMatch(text, /\d\s*%/, `${language} ${key} gives no percentage`);
    }
  }
});

test('the field of dots is between 0 and 1, moves with the time, and differs from place to place', () => {
  let low = 1;
  let high = 0;
  for (let step = 0; step < 400; step += 1) {
    const value = dotIntensity((step % 20) / 19, Math.floor(step / 20) / 19, step * 0.37);
    assert.ok(value >= 0 && value <= 1, `step ${step}: ${value}`);
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  assert.ok(high - low > 0.5, 'there are strong and faint places');
  assert.equal(dotIntensity(0.3, 0.6, 4.2), dotIntensity(0.3, 0.6, 4.2), 'the same place and time give the same value');
  assert.notEqual(dotIntensity(0.3, 0.6, 4.2), dotIntensity(0.3, 0.6, 9.9), 'later it is another');
  assert.notEqual(dotIntensity(0.1, 0.1, 4.2), dotIntensity(0.8, 0.7, 4.2));
});

const fakeContext = () => {
  const calls = { arcs: [], alphas: [], clears: 0, fills: 0, transforms: [] };
  return {
    calls,
    clearRect: () => { calls.clears += 1; },
    beginPath: () => {},
    arc: (x, y, radius) => calls.arcs.push({ x, y, radius }),
    fill: () => { calls.fills += 1; },
    setTransform: (...values) => calls.transforms.push(values),
    set globalAlpha(value) { calls.alphas.push(value); },
    get globalAlpha() { return calls.alphas.at(-1) ?? 1; },
    fillStyle: ''
  };
};

test('a picture of the field is one dot for each place of the grid, in the colour it is given, inside the box', () => {
  const context = fakeContext();
  drawDots(context, { width: 140, height: 70, seconds: 2, color: '#ff8800' });
  assert.equal(context.fillStyle, '#ff8800');
  assert.equal(context.calls.arcs.length, 10 * 5, 'a dot every 14px');
  assert.equal(context.calls.clears, 1);
  for (const { x, y, radius } of context.calls.arcs) {
    assert.ok(x >= 0 && x <= 140 && y >= 0 && y <= 70, 'inside');
    assert.ok(radius > 0.5 && radius < 7, `radius ${radius}`);
  }
  assert.ok(Math.max(...context.calls.alphas) > Math.min(...context.calls.alphas), 'strong and faint dots');
  assert.equal(context.calls.alphas.at(-1), 1, 'the context is left as it was found');
});

function makeWorld({ startedAt = 0, reducedMotion = false, now0 = 1_000_000 } = {}) {
  const world = { time: now0, frames: [], cancelled: [], timers: [], cleared: [], context: fakeContext() };
  const label = { textContent: '', dataset: {}, classList: { removed: 0, added: 0, remove() { this.removed += 1; }, add() { this.added += 1; } } };
  const canvas = { width: 0, height: 0, getContext: () => world.context };
  world.label = label;
  world.wait = createImageWait({
    host: {},
    label,
    canvas,
    startedAt,
    now: () => world.time,
    texts: { imageWaitStage1: 'one', imageWaitStage2: 'two', imageWaitStage3: 'three', imageWaitStage4: 'four' },
    reducedMotion,
    requestFrame: (callback) => { world.frames.push(callback); return world.frames.length; },
    cancelFrame: (handle) => world.cancelled.push(handle),
    setTimer: (callback, delay) => { world.timers.push({ callback, delay }); return world.timers.length; },
    clearTimer: (handle) => world.cleared.push(handle),
    color: '#123456',
    size: () => ({ width: 280, height: 140, ratio: 3 })
  });
  return world;
}

test('the words follow the time, a second at a time', () => {
  const world = makeWorld();
  world.wait.start();
  assert.equal(world.label.textContent, 'one', 'the words are there at once');
  assert.equal(world.timers[0].delay, 1000);
  world.time += 6000;
  world.timers[0].callback();
  assert.equal(world.label.textContent, 'two');
  world.time += 10000;
  world.timers[0].callback();
  assert.equal(world.label.textContent, 'three');
  world.time += 30000;
  world.timers[0].callback();
  assert.equal(world.label.textContent, 'four');
  const written = world.label.classList.added;
  world.time += 20000;
  world.timers[0].callback();
  assert.equal(world.label.classList.added, written, 'a stage that goes on does not move the words again');
});

test('a picture begun before the page drew its place-holder goes on from its own time; a time in the future is not believed', () => {
  const old = makeWorld({ startedAt: 1_000_000 - 20_000 });
  old.wait.start();
  assert.equal(old.label.textContent, 'three');
  const future = makeWorld({ startedAt: 1_000_000 + 60_000 });
  future.wait.start();
  assert.equal(future.label.textContent, 'one');
});

test('a line that another part of the page wrote stays until it is let go', () => {
  const world = makeWorld();
  world.label.textContent = 'the request is being translated';
  world.label.dataset.pinned = '1';
  world.wait.start();
  world.time += 7000;
  world.timers[0].callback();
  assert.equal(world.label.textContent, 'the request is being translated');
  delete world.label.dataset.pinned;
  world.wait.refresh();
  assert.equal(world.label.textContent, 'two', 'let go, the words of the stage come back at once');
});

test('the dots are drawn on the frames, at most thirty times a second, at the size of the place and the screen', () => {
  const world = makeWorld();
  world.wait.start();
  assert.equal(world.frames.length, 1);
  world.frames.shift()(0);
  assert.equal(world.context.calls.arcs.length, 20 * 10, 'one picture');
  assert.deepEqual(world.context.calls.transforms.at(-1), [2, 0, 0, 2, 0, 0], 'the screen ratio is used up to 2');
  world.frames.shift()(10);
  assert.equal(world.context.calls.arcs.length, 20 * 10, 'a frame too soon after the last is not drawn');
  world.frames.shift()(40);
  assert.equal(world.context.calls.arcs.length, 20 * 10 * 2, 'a later one is');
});

test('with less motion asked for the dots are drawn once, still, and there is no loop; the words still follow the time', () => {
  const world = makeWorld({ reducedMotion: true });
  world.wait.start();
  assert.equal(world.frames.length, 0);
  assert.equal(world.context.calls.arcs.length, 20 * 10);
  world.wait.resize();
  assert.equal(world.context.calls.arcs.length, 20 * 10 * 2, 'drawn again when the place changes size');
  world.time += 7000;
  world.timers[0].callback();
  assert.equal(world.label.textContent, 'two');
});

test('when it stops nothing goes on', () => {
  const world = makeWorld();
  world.wait.start();
  world.wait.stop();
  assert.deepEqual(world.cancelled, [1]);
  assert.deepEqual(world.cleared, [1]);
  world.frames.shift()(100);
  assert.equal(world.context.calls.arcs.length, 0, 'a frame that was already asked for draws nothing');
  assert.equal(world.frames.length, 0, 'and asks for no other');
});

test('the markup of the place-holder escapes the words and tells when the picture was begun', () => {
  assert.equal(imageWaitMarkup({ label: 'a<b>"c"' }), '<span class="generated-image-wait-label">a&lt;b&gt;&quot;c&quot;</span><noureon-image-wait aria-hidden="true"></noureon-image-wait>');
  assert.match(imageWaitMarkup({ label: 'x', startedAt: 1760000000000.4 }), /<noureon-image-wait data-started="1760000000000" /);
  assert.doesNotMatch(imageWaitMarkup({ label: 'x', startedAt: -5 }), /data-started/);
});

test('the element draws on a canvas of its own and stops when it leaves the page', async () => {
  const window = new Window({ url: 'https://example.test/' });
  const saved = {};
  for (const name of ['customElements', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'i18n']) saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  const frames = [];
  Object.defineProperty(globalThis, 'customElements', { value: window.customElements, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { value: (callback) => frames.push(callback), configurable: true });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { value: () => {}, configurable: true });
  Object.defineProperty(globalThis, 'matchMedia', { value: () => ({ matches: true }), configurable: true });
  Object.defineProperty(globalThis, 'i18n', { value: i18n, configurable: true });
  try {
    await import(`../src/app/ui/image-wait/image-wait.js?element=${Date.now()}`);
    assert.ok(window.customElements.get('noureon-image-wait'), 'the element is defined');
    window.document.documentElement.lang = 'fr';
    window.document.body.innerHTML = `<div class="generated-image-skeleton">${imageWaitMarkup({ label: 'x' })}</div>`;
    const element = window.document.querySelector('noureon-image-wait');
    assert.ok(element.querySelector('canvas.generated-image-dots'), 'a canvas of its own');
    assert.equal(window.document.querySelector('.generated-image-wait-label').textContent, i18n.fr.imageWaitStage1, 'the words are in the language of the page');
    element.remove();
    assert.equal(element.querySelector('canvas'), null, 'it clears itself when it leaves');
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
