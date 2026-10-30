import assert from 'node:assert/strict';
import test from 'node:test';

import { watchComposerGrowth } from '../src/app/runtime/features/composer-growth-watch.js';

function fakeTextarea() {
  const listeners = new Map();
  const box = {
    value: '', scrollHeight: 24, clientHeight: 24, style: { maxHeight: '240px' }, ownerDocument: { activeElement: null },
    addEventListener: (name, handler) => { listeners.set(name, [...(listeners.get(name) || []), handler]); },
    removeEventListener: (name, handler) => { listeners.set(name, (listeners.get(name) || []).filter((entry) => entry !== handler)); },
    fire: (name) => (listeners.get(name) || []).forEach((handler) => handler())
  };
  return box;
}
const clock = () => {
  const timers = new Set();
  return { setInterval: (fn) => { timers.add(fn); return fn; }, clearInterval: (id) => timers.delete(id), tick: () => [...timers].forEach((fn) => fn()), count: () => timers.size };
};

test('text that arrives without an input event (voice typing) still makes the box grow', () => {
  const box = fakeTextarea();
  const time = clock();
  let adjusted = 0;
  watchComposerGrowth({ textarea: box, adjust: () => { adjusted += 1; }, ...time });
  box.fire('focus');
  time.tick();
  assert.equal(adjusted, 0, 'nothing changed, nothing to do');
  box.value = 'a long sentence spoken into the box';
  time.tick();
  assert.equal(adjusted, 1, 'the text changed with no input event');
  box.scrollHeight = 72;
  time.tick();
  assert.equal(adjusted, 2, 'the text no longer fits and there is room to grow');
  box.clientHeight = 240;
  box.scrollHeight = 400;
  time.tick();
  assert.equal(adjusted, 2, 'at its own limit it stays, and is not measured over and over');
});

test('it looks only while the box has the focus, and looks once more when it loses it', () => {
  const box = fakeTextarea();
  const time = clock();
  let adjusted = 0;
  watchComposerGrowth({ textarea: box, adjust: () => { adjusted += 1; }, ...time });
  assert.equal(time.count(), 0);
  box.fire('focus');
  assert.equal(time.count(), 1);
  box.value = 'spoken';
  box.fire('blur');
  assert.equal(time.count(), 0);
  assert.equal(adjusted, 1, 'the last words are not missed');
  box.value = 'typed after the composition ended';
  box.fire('compositionend');
  assert.equal(adjusted, 2);
});
