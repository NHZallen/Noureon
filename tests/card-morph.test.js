import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { measureCard, playMorph } from '../src/app/ui/sandbox/card-morph.js';

// A card and a pill in a root, with sizes given by hand (the layout engine of the test has none) and an `animate` that records what it was told.
const world = ({ cardHidden, pillHidden, reduce = false }) => {
  const window = new Window();
  const { document } = window;
  window.matchMedia = () => ({ matches: reduce });
  const root = document.createElement('div');
  const card = document.createElement('div');
  const pill = document.createElement('div');
  root.append(card, pill);
  document.body.append(root);
  card.hidden = cardHidden;
  pill.hidden = pillHidden;
  const sizes = { root: { width: 360, height: 40 }, card: { width: 360, height: 270 }, pill: { width: 200, height: 40 } };
  const box = (name) => () => ({ ...sizes[name], top: 0, left: 0 });
  root.getBoundingClientRect = box('root');
  card.getBoundingClientRect = box('card');
  pill.getBoundingClientRect = box('pill');
  window.getComputedStyle = () => ({ borderTopLeftRadius: '18px' });
  const played = [];
  const make = (name) => (frames, options) => {
    let finish;
    const finished = new Promise((resolve) => { finish = resolve; });
    const animation = { name, frames, options, finished, cancelled: false, cancel() { this.cancelled = true; finish(); }, end: () => finish() };
    played.push(animation);
    return animation;
  };
  root.animate = make('root');
  card.animate = make('card');
  pill.animate = make('pill');
  return { window, root, card, pill, sizes, played };
};

test('measureCard gives the sizes of what is shown and nothing for what is hidden', () => {
  const w = world({ cardHidden: true, pillHidden: false });
  const sizes = measureCard(w);
  assert.equal(sizes.card, null);
  assert.deepEqual(sizes.pill, { width: 200, height: 40 });
  assert.equal(sizes.rootHeight, 40);
});

test('opening: the card opens from the shape of the pill to the whole card, the pill fades, and the whole grows in height; everything is cleaned up at the end', async () => {
  const w = world({ cardHidden: false, pillHidden: true });
  const before = { rootHeight: 40, card: null, pill: { width: 200, height: 40 } };
  const done = playMorph({ direction: 'open', before, ...w });
  const names = w.played.map((entry) => entry.name).sort();
  assert.deepEqual(names, ['card', 'pill', 'root']);
  const card = w.played.find((entry) => entry.name === 'card');
  assert.match(card.frames[0].clipPath, /^inset\(0px 160px 230px 0px round 20px\)$/, 'starts as the pill: 360-200 from the right, 270-40 from the bottom');
  assert.match(card.frames[1].clipPath, /^inset\(0px 0px 0px 0px round 18px\)$/);
  assert.equal(card.options.easing, 'cubic-bezier(0.32, 0.72, 0, 1)');
  const root = w.played.find((entry) => entry.name === 'root');
  assert.deepEqual(root.frames.map((frame) => frame.height), ['40px', '40px']);
  assert.equal(w.pill.hidden, false, 'the pill stays for the length of the change');
  assert.equal(w.pill.style.pointerEvents, 'none');
  w.played.forEach((entry) => entry.end());
  await done;
  assert.equal(w.pill.hidden, true);
  assert.equal(w.card.hidden, false);
  assert.equal(w.root.getAttribute('style'), null);
  assert.ok(w.played.every((entry) => entry.cancelled), 'the animations do not stay on the page');
});

test('folding: the card closes to the shape of the pill and fades out, the pill comes; the card is hidden at the end', async () => {
  const w = world({ cardHidden: true, pillHidden: false });
  const before = { rootHeight: 270, card: { width: 360, height: 270 }, pill: null };
  const done = playMorph({ direction: 'fold', before, ...w });
  const card = w.played.find((entry) => entry.name === 'card');
  assert.match(card.frames[0].clipPath, /inset\(0px 0px 0px 0px/);
  assert.match(card.frames[1].clipPath, /^inset\(0px 160px 230px 0px round 20px\)$/);
  assert.equal(card.frames[2].opacity, 0);
  assert.equal(w.card.hidden, false, 'the card is laid over the pill while it folds');
  assert.equal(w.card.style.width, '360px');
  w.played.forEach((entry) => entry.end());
  await done;
  assert.equal(w.card.hidden, true);
  assert.equal(w.card.getAttribute('style'), null);
});

test('a new change cuts the one before short; reduced motion and a missing size play nothing', async () => {
  const w = world({ cardHidden: false, pillHidden: true });
  const before = { rootHeight: 40, card: null, pill: { width: 200, height: 40 } };
  const first = playMorph({ direction: 'open', before, ...w });
  const firstAnimations = [...w.played];
  playMorph({ direction: 'open', before, ...w });
  await first;
  assert.ok(firstAnimations.every((entry) => entry.cancelled));

  const calm = world({ cardHidden: false, pillHidden: true, reduce: true });
  await playMorph({ direction: 'open', before, ...calm });
  assert.equal(calm.played.length, 0);

  const nothing = world({ cardHidden: false, pillHidden: true });
  await playMorph({ direction: 'open', before: null, ...nothing });
  assert.equal(nothing.played.length, 0);
});
