import test from 'node:test';
import assert from 'node:assert/strict';

import { bindGeneratedImageSets, renderGeneratedImageSet } from '../src/app/legacy-runtime/features/generated-image-set.js';
import { imageThumbsPlaceholder } from '../src/app/ui/image-wait/image-wait-markup.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const card = (id) => `<figure class="generated-image-card" data-generated-image-card="${id}"><img data-generated-image-id="${id}"></figure>`;
const assets = ['a', 'b', 'c'].map(id => ({ id }));

test('one picture stays as it was, several become a set with a small picture for each', () => {
  assert.equal(renderGeneratedImageSet({ cards: [card('a')], assets: [assets[0]] }), card('a'));
  assert.equal(renderGeneratedImageSet({ cards: [], assets: [] }), '');
  const html = renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets, label: 'Picture {n} of {total}' });
  assert.equal((html.match(/class="generated-image-slide"/g) || []).length, 3);
  assert.equal((html.match(/data-generated-image-thumb="/g) || []).length, 3);
  assert.match(html, /aria-label="Picture 2 of 3"/);
  assert.match(html, /generated-image-thumb is-active" data-generated-image-thumb="0"/, 'the first is the chosen one');
  assert.match(html, /<img data-generated-image-id="c" alt="" loading="lazy">/, 'the small picture is loaded like the big one');
  assert.match(renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets }), /aria-label="3 \/ 3"/, 'without words the number alone');
});

test('swiping the big picture moves the mark, tapping a small one brings its picture', async () => {
  const { document, window, cleanup } = createDom(`<div id="root">${renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets })}</div>`);
  const root = document.getElementById('root');
  const track = root.querySelector('[data-generated-image-track]');
  const strip = root.querySelector('[data-generated-image-thumbs]');
  const scrolls = [];
  Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
  track.scrollTo = (options) => { scrolls.push(options); };
  strip.scrollTo = () => {};
  bindGeneratedImageSets(root, { prefersReducedMotion: () => false });
  bindGeneratedImageSets(root, { prefersReducedMotion: () => false });
  const buttons = Array.from(root.querySelectorAll('[data-generated-image-thumb]'));
  const marked = () => buttons.findIndex(button => button.classList.contains('is-active'));

  buttons[2].click();
  assert.equal(marked(), 2);
  assert.equal(buttons[2].getAttribute('aria-current'), 'true');
  assert.equal(buttons[0].getAttribute('aria-current'), 'false');
  assert.deepEqual(scrolls, [{ left: 600, behavior: 'smooth' }], 'bound once, one scroll to the third picture');

  track.scrollLeft = 300;
  track.dispatchEvent(new window.Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(marked(), 1, 'a swipe to the second picture moves the mark');

  strip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(marked(), 2);
  strip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(marked(), 2, 'no further than the last');
  cleanup();
});

test('a waiting request that makes several pictures shows a place-holder for each', () => {
  assert.equal(imageThumbsPlaceholder(1), '');
  assert.equal(imageThumbsPlaceholder(undefined), '');
  const html = imageThumbsPlaceholder(4);
  assert.equal((html.match(/generated-image-thumb-wait/g) || []).length, 4);
  assert.match(html, /aria-hidden="true"/);
});
