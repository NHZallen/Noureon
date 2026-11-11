import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { markPicturesPending, settlePicture, settlePictures } from '../src/app/ui/files/picture-loading.js';

const page = () => {
  const window = new Window();
  window.document.body.innerHTML = '<figure class="generated-image-card"><img data-generated-image-id="a"></figure><figure class="generated-image-card"><img data-generated-image-id="b"></figure>';
  return window;
};

test('a picture on its way waits in its card until it is there', () => {
  const window = page();
  const root = window.document.body;
  markPicturesPending(root, [{ id: 'a' }, { id: 'b' }]);
  const [first, second] = root.querySelectorAll('.generated-image-card');
  assert.ok(first.classList.contains('is-pending') && second.classList.contains('is-pending'));
  settlePicture(root.querySelector('[data-generated-image-id="a"]'));
  assert.ok(!first.classList.contains('is-pending') && first.classList.contains('is-ready'));
  settlePictures(root, 'b');
  assert.ok(!second.classList.contains('is-pending'));
  // A card that is already there does not wait again when it is bound once more.
  markPicturesPending(root, [{ id: 'a' }]);
  assert.ok(!first.classList.contains('is-pending'));
  window.close();
});

test('the shimmer shows only for a card that has been on the screen a moment and is still waiting; a card far away just keeps its place', async () => {
  const observers = [];
  globalThis.IntersectionObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} unobserve() {} };
  const window = page();
  try {
    const root = window.document.body;
    markPicturesPending(root, [{ id: 'a' }, { id: 'b' }]);
    const [near, far] = root.querySelectorAll('.generated-image-card');
    assert.ok(near.classList.contains('is-pending') && !near.classList.contains('is-waiting'), 'waiting for nobody: no shimmer');
    const [observer] = observers;
    observer.callback([{ target: near, isIntersecting: true }]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(near.classList.contains('is-waiting'), 'on the screen and still not there: the shimmer');
    assert.ok(!far.classList.contains('is-waiting'), 'far from the screen: only its place');
    settlePicture(root.querySelector('[data-generated-image-id="a"]'));
    assert.ok(!near.classList.contains('is-waiting') && near.classList.contains('is-ready'));
    // A picture that is there before the moment is over never shows the shimmer.
    observer.callback([{ target: far, isIntersecting: true }]);
    settlePicture(root.querySelector('[data-generated-image-id="b"]'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(!far.classList.contains('is-waiting'));
  } finally {
    delete globalThis.IntersectionObserver;
    window.close();
  }
});
