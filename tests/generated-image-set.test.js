import test from 'node:test';
import assert from 'node:assert/strict';

import { bindGeneratedImageSets, renderGeneratedImageSet } from '../src/app/runtime/images/generated-image-set.js';
import { imageThumbsPlaceholder } from '../src/app/ui/image-wait/image-wait-markup.js';
import { createDom } from './behaviours/helpers/create-dom.js';

const card = (id) => `<figure class="generated-image-card" data-generated-image-card="${id}"><img data-generated-image-id="${id}"></figure>`;
const assets = ['a', 'b', 'c'].map(id => ({ id }));

test('one picture stays as it was, several become a set with a small picture for each', () => {
  assert.equal(renderGeneratedImageSet({ cards: [card('a')], assets: [assets[0]] }), card('a'));
  assert.equal(renderGeneratedImageSet({ cards: [], assets: [] }), '');
  const html = renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets, label: 'Picture {n} of {total}' });
  assert.equal((html.match(/class="generated-image-slide/g) || []).length, 3);
  assert.equal((html.match(/ inert aria-hidden="true"/g) || []).length, 2, 'the first picture is shown, the others wait');
  assert.equal((html.match(/data-generated-image-thumb="/g) || []).length, 3);
  assert.match(html, /aria-label="Picture 2 of 3"/);
  assert.match(html, /generated-image-thumb is-active" data-generated-image-thumb="0"/, 'the first is the chosen one');
  assert.match(html, /<img data-generated-image-id="c" alt="" loading="lazy">/, 'the small picture is loaded like the big one');
  assert.match(renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets }), /aria-label="3 \/ 3"/, 'without words the number alone');
});

test('tapping a small picture shows its picture at once, with no sliding and no swiping of the big one', async () => {
  const { document, window, cleanup } = createDom(`<div id="root">${renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets })}</div>`);
  const root = document.getElementById('root');
  const track = root.querySelector('[data-generated-image-track]');
  const strip = root.querySelector('[data-generated-image-thumbs]');
  const slides = Array.from(root.querySelectorAll('.generated-image-slide'));
  let trackScrolls = 0;
  track.scrollTo = () => { trackScrolls += 1; };
  const stripScrolls = [];
  strip.scrollTo = (options) => { stripScrolls.push(options); };
  bindGeneratedImageSets(root);
  bindGeneratedImageSets(root);
  const buttons = Array.from(root.querySelectorAll('[data-generated-image-thumb]'));
  const marked = () => buttons.findIndex(button => button.classList.contains('is-active'));
  const shown = () => slides.findIndex(slide => slide.classList.contains('is-active'));

  assert.equal(shown(), 0);
  assert.equal(slides[1].hasAttribute('inert'), true, 'the hidden pictures cannot be reached');
  assert.equal(slides[0].hasAttribute('inert'), false);

  buttons[2].click();
  assert.equal(marked(), 2, 'the mark moves in the same moment as the tap');
  assert.equal(shown(), 2);
  assert.equal(buttons[2].getAttribute('aria-current'), 'true');
  assert.equal(buttons[0].getAttribute('aria-current'), 'false');
  assert.equal(slides[2].hasAttribute('inert'), false);
  assert.equal(slides[0].hasAttribute('inert'), true);
  assert.equal(trackScrolls, 0, 'the big picture is not scrolled');
  assert.deepEqual(stripScrolls.map(options => options.behavior), ['auto'], 'the row of small pictures does not glide either');

  track.scrollLeft = 300;
  track.dispatchEvent(new window.Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(marked(), 2, 'a swipe on the big picture changes nothing');

  strip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(marked(), 1);
  assert.equal(shown(), 1);
  strip.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
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

test('on a phone the row of small pictures runs out to both edges of the screen, in line with the big picture at the start', () => {
  const { document, cleanup } = createDom(`<div id="root">${renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets })}</div>`);
  const root = document.getElementById('root');
  const set = root.querySelector('[data-generated-image-set]');
  const strip = root.querySelector('[data-generated-image-thumbs]');
  set.getBoundingClientRect = () => ({ left: 16, right: 336, width: 320 });
  bindGeneratedImageSets(root, { isPhone: () => true, bounds: () => ({ left: 0, right: 390 }) });
  assert.equal(strip.style.marginLeft, '-20px', 'the 16px to the screen edge and the room for the ring');
  assert.equal(strip.style.paddingLeft, '20px');
  assert.equal(strip.style.marginRight, '-58px', '54px to the right edge and the ring');
  assert.equal(strip.style.paddingRight, '58px');
  cleanup();

  const second = createDom(`<div id="root">${renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets })}</div>`);
  const other = second.document.getElementById('root');
  other.querySelector('[data-generated-image-set]').getBoundingClientRect = () => ({ left: 16, right: 336, width: 320 });
  bindGeneratedImageSets(other, { isPhone: () => false, bounds: () => ({ left: 0, right: 390 }) });
  const otherStrip = other.querySelector('[data-generated-image-thumbs]');
  assert.equal(otherStrip.style.marginLeft, '', 'off the phone the row keeps to the column');
  assert.equal(otherStrip.style.paddingRight, '');
  second.cleanup();
});

test('a row that fits the screen is dragged with resistance and springs back; a tap after a drag is not a choice', async () => {
  const { document, window, cleanup } = createDom(`<div id="root">${renderGeneratedImageSet({ cards: assets.map(a => card(a.id)), assets })}</div>`);
  const root = document.getElementById('root');
  const strip = root.querySelector('[data-generated-image-thumbs]');
  Object.defineProperty(strip, 'clientWidth', { value: 300, configurable: true });
  Object.defineProperty(strip, 'scrollWidth', { value: 300, configurable: true });
  bindGeneratedImageSets(root, { isPhone: () => false });
  assert.equal(strip.style.touchAction, 'pan-y', 'the horizontal drag is for the row');
  const touch = (type, x, y = 10) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', clientX: x, clientY: y });
    strip.dispatchEvent(event);
  };
  const buttons = Array.from(root.querySelectorAll('[data-generated-image-thumb]'));
  const shown = () => buttons.findIndex(button => button.classList.contains('is-active'));

  touch('pointerdown', 100);
  touch('pointermove', 103);
  assert.equal(strip.style.transform, '', 'a small movement is not yet a drag');
  touch('pointermove', 200);
  const pulled = Number(/translateX\((-?[\d.]+)px\)/.exec(strip.style.transform)?.[1]);
  assert.ok(pulled > 0 && pulled < 100, `the pull (${pulled}px) is less than the 100px dragged`);
  touch('pointermove', 400);
  const pulledMore = Number(/translateX\((-?[\d.]+)px\)/.exec(strip.style.transform)?.[1]);
  assert.ok(pulledMore > pulled && pulledMore < 300 * 0.9, 'the farther, the harder it pulls back, and never past the row');
  touch('pointerup', 400);
  assert.equal(strip.style.transform, '', 'it goes back when the finger lets go');
  assert.match(strip.style.transition, /transform/, 'with a short ease-out');
  buttons[2].click();
  assert.equal(shown(), 0, 'the tap that ends a drag chooses nothing');
  await new Promise(resolve => setTimeout(resolve, 20));
  buttons[2].click();
  assert.equal(shown(), 2, 'a later tap does');

  // A drag that goes up or down is the page's.
  touch('pointerdown', 100, 10);
  touch('pointermove', 102, 80);
  touch('pointermove', 180, 120);
  assert.equal(strip.style.transform, '');
  touch('pointerup', 180, 120);

  // A mouse is not dragged: it scrolls the usual way.
  const mouse = new window.Event('pointerdown', { bubbles: true });
  Object.assign(mouse, { pointerId: 2, pointerType: 'mouse', clientX: 100, clientY: 10 });
  strip.dispatchEvent(mouse);
  touch('pointermove', 300);
  assert.equal(strip.style.transform, '');
  cleanup();
});
