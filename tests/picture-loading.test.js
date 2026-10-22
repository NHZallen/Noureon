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
