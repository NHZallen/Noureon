import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { keepInPlace } from '../src/app/ui/sandbox/keep-in-place.js';

// A page with a scroll box: `end` is how far it can scroll; the element's place is its place in the content minus the scroll position.
const page = ({ scrollTop, content }) => {
  const window = new Window();
  const { document } = window;
  const box = document.createElement('div');
  const element = document.createElement('div');
  box.append(element);
  document.body.append(box);
  const state = { scrollTop, content };
  Object.defineProperty(box, 'scrollTop', { get: () => state.scrollTop, set: (value) => { state.scrollTop = Math.max(0, Math.min(Math.max(0, state.content + (parseFloat(element.style.paddingBottom) || 0) - 600), value)); } });
  Object.defineProperty(box, 'scrollHeight', { get: () => state.content + (parseFloat(element.style.paddingBottom) || 0) });
  Object.defineProperty(box, 'clientHeight', { get: () => 600 });
  window.getComputedStyle = () => ({ overflowY: 'auto' });
  element.getBoundingClientRect = () => ({ top: 700 - state.scrollTop });
  return { window, element, state };
};

test('a card that gets shorter at the end of the page stays where it is: the room it loses is kept below it, and given back when it grows', () => {
  const { window, element, state } = page({ scrollTop: 400, content: 1000 });
  try {
    // The end of the page is at 400; the card gets 230 shorter, so the page can only go to 170.
    const before = element.getBoundingClientRect().top;
    keepInPlace(element, () => { state.content -= 230; element.parentElement.scrollTop = state.scrollTop; });
    assert.equal(element.getBoundingClientRect().top, before, 'the card did not move');
    assert.equal(element.style.paddingBottom, '230px');
    keepInPlace(element, () => { state.content += 230; }, { release: true });
    assert.equal(element.style.paddingBottom, '');
    assert.equal(element.getBoundingClientRect().top, before);
  } finally {
    window.happyDOM.abort();
  }
});

test('without a scroll box around it the change just happens', () => {
  const window = new Window();
  const element = window.document.createElement('div');
  window.document.body.append(element);
  let ran = false;
  keepInPlace(element, () => { ran = true; });
  assert.equal(ran, true);
  window.happyDOM.abort();
});
