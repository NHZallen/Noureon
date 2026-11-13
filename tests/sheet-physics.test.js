import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRelease, geometry, resist, springStep, velocityOf, SIDE_GAP, BOTTOM_GAP } from '../src/app/ui/sheet/sheet-physics.js';

// The reference screen (a 393 × 852 phone): the medium height has its top edge at 402, the large one at 58.
const SCREEN = { medium: 402, large: 58, mediumHeight: 442 };

test('the card floats at the medium height and its gaps close in step with the pull (measured from the reference)', () => {
  const at = (top) => geometry({ top, ...SCREEN });
  assert.equal(at(402).side, SIDE_GAP, 'a gap of 8 at the medium height');
  assert.equal(at(402).bottom, BOTTOM_GAP);
  assert.equal(at(58).side, 0, 'no gap at the large height');
  assert.equal(at(58).bottom, 0);
  assert.equal(at(58).bottomRadius, 0, 'flush with the screen at the bottom');
  // The reference: at the half of the way (grip 252 → top edge about 230) the gap is about 4.
  assert.ok(Math.abs(at(230).side - 4) < 0.1);
  assert.ok(Math.abs(at(58 + (402 - 58) * 0.2).side - 1.6) < 0.1, 'a fifth from the top: a gap of 1.6');
  // Below the medium height the card only slides down, and keeps its gaps.
  const low = at(600);
  assert.equal(low.top, 402);
  assert.equal(low.shift, 198);
  assert.equal(low.side, SIDE_GAP);
});

test('a pull above the large height gives a fifth', () => {
  assert.equal(resist(58, 58), 58);
  assert.equal(resist(100, 58), 100);
  assert.equal(resist(8, 58), 48);
});

test('a release ends where it is going: a flick up opens, a flick or a long pull down closes, otherwise the nearest stop', () => {
  assert.equal(decideRelease({ ...SCREEN, top: 300, velocity: -900 }), 'large');
  assert.equal(decideRelease({ ...SCREEN, top: 402, velocity: 900 }), 'close');
  assert.equal(decideRelease({ ...SCREEN, top: 100, velocity: 900 }), 'medium', 'from the large height a flick down goes to the middle first');
  assert.equal(decideRelease({ ...SCREEN, top: 600, velocity: 0 }), 'close', 'let go well below the medium height');
  assert.equal(decideRelease({ ...SCREEN, top: 440, velocity: 0 }), 'medium', 'a short pull down settles back');
  assert.equal(decideRelease({ ...SCREEN, top: 150, velocity: 0 }), 'large');
  assert.equal(decideRelease({ ...SCREEN, top: 300, velocity: 0 }), 'medium');
  assert.equal(decideRelease({ ...SCREEN, top: 150, velocity: 0, expandable: false }), 'medium', 'a sheet that cannot grow');
  assert.equal(decideRelease({ ...SCREEN, top: 700, velocity: 0, closable: false }), 'medium');
});

// The reference settles in about 0.4 s and never bounces: from far below, and back to the medium stop from a pull a little past it.
const run = (from, to, velocity = 0, seconds = 1.2) => {
  let state = { x: from, v: velocity };
  const path = [];
  for (let t = 0; t < seconds; t += 1 / 240) {
    state = springStep(state, to, 1 / 240);
    path.push({ t, x: state.x });
  }
  return path;
};

test('the card slows down into its stop and does not bounce', () => {
  const up = run(655, 402);
  assert.ok(Math.max(...up.map((p) => p.x)) <= 655 && Math.min(...up.map((p) => p.x)) >= 401.99, 'coming in from below it only slows down');
  const reaches = up.find((p) => Math.abs(p.x - 402) < 1);
  assert.ok(reaches.t > 0.25 && reaches.t < 0.6, `within a pixel at ${reaches.t.toFixed(2)} s (the reference: about 0.4 s)`);
  const back = run(427, 402);
  assert.ok(Math.min(...back.map((p) => p.x)) >= 401.99, 'back from a pull past the stop, it does not cross it');
  // The reference, frame by frame (50 ms apart): 434 426 419 414 412 410 409 on the way back to 409: each step keeps about 0.6 of the distance.
  const ratio = (back.find((p) => p.t >= 0.05).x - 402) / 25;
  assert.ok(ratio > 0.5 && ratio < 0.8, `keeps ${ratio.toFixed(2)} of the distance after 50 ms`);
});

test('the speed of a touch is the slope of its last 100 ms', () => {
  assert.equal(velocityOf([]), 0);
  assert.equal(velocityOf([{ t: 0, y: 0 }]), 0);
  assert.equal(velocityOf([{ t: 0, y: 0 }, { t: 100, y: 50 }]), 500);
  assert.equal(Math.round(velocityOf([{ t: 0, y: 0 }, { t: 200, y: 100 }, { t: 250, y: 150 }, { t: 300, y: 200 }])), 1000, 'only the last 100 ms count');
});
