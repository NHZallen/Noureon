import assert from 'node:assert/strict';
import test from 'node:test';

import { createTrackpad, HOLD_MS, TAP_MS } from '../src/app/ui/browser-live/trackpad.js';

const make = () => {
  const log = [];
  const pad = createTrackpad({
    width: () => 200,
    onMove: (dx, dy) => log.push(['move', dx, dy]),
    onClick: () => log.push(['click']),
    onDragStart: () => log.push(['dragStart']),
    onDragEnd: () => log.push(['dragEnd']),
    onScroll: (dx, dy) => log.push(['scroll', dx, dy])
  });
  return { pad, log };
};

test('a short touch that does not move is a click', () => {
  const { pad, log } = make();
  pad.down(1, 50, 50, 0);
  pad.up(1, TAP_MS - 50);
  assert.deepEqual(log, [['click']]);
});

test('a touch that is too long, or that moved, is not a click', () => {
  const a = make();
  a.pad.down(1, 50, 50, 0);
  a.pad.up(1, TAP_MS + 50);
  assert.deepEqual(a.log, []);
  const b = make();
  b.pad.down(1, 50, 50, 0);
  b.pad.move(1, 70, 50, 40);
  b.pad.up(1, 80);
  assert.deepEqual(b.log, [['move', 0.1, 0]], 'a slide moves the circle by how far the finger went (in widths of the pad), and then it is not a click');
});

test('sliding moves the circle by the distance, step by step', () => {
  const { pad, log } = make();
  pad.down(1, 0, 0, 0);
  pad.move(1, 20, 0, 20);
  pad.move(1, 20, 40, 40);
  assert.deepEqual(log, [['move', 0.1, 0], ['move', 0, 0.2]]);
});

test('a finger held still and then moved drags; letting go ends the drag and is not a click', () => {
  const { pad, log } = make();
  pad.down(1, 10, 10, 0);
  pad.move(1, 40, 10, HOLD_MS + 20);
  assert.equal(pad.dragging, true);
  pad.move(1, 60, 10, HOLD_MS + 60);
  pad.up(1, HOLD_MS + 100);
  assert.deepEqual(log.map((entry) => entry[0]), ['dragStart', 'move', 'move', 'dragEnd']);
  assert.equal(pad.dragging, false);
});

test('a slide that goes on for longer than the hold time is still a slide: only a finger that was held still before it moved drags (it selected text all over the page)', () => {
  const { pad, log } = make();
  pad.down(1, 50, 50, 0);
  // slides at once, and goes on well past the time it takes to take hold
  for (let at = 20; at <= HOLD_MS * 3; at += 20) pad.move(1, 50 + at / 4, 50, at);
  pad.up(1, HOLD_MS * 3 + 20);
  assert.ok(!log.some(([name]) => name === 'dragStart' || name === 'dragEnd'), 'no button was pressed in the page');
  assert.ok(log.filter(([name]) => name === 'move').length > 10, 'the circle moved');
  assert.ok(!log.some(([name]) => name === 'click'));
  // held still first: that is a drag
  const held = make();
  held.pad.down(1, 50, 50, 0);
  held.pad.move(1, 50, 50, HOLD_MS - 20);
  held.pad.move(1, 70, 50, HOLD_MS + 40);
  held.pad.move(1, 90, 50, HOLD_MS + 80);
  held.pad.up(1, HOLD_MS + 120);
  assert.deepEqual(held.log.filter(([name]) => name !== 'move').map(([name]) => name), ['dragStart', 'dragEnd']);
  assert.equal(held.log.filter(([name]) => name === 'dragStart').length, 1, 'once');
});

test('two fingers sliding scroll by the middle of them; lifting them is not a click', () => {
  const { pad, log } = make();
  pad.down(1, 20, 20, 0);
  pad.down(2, 60, 20, 0);
  pad.move(1, 20, 40, 30);
  pad.move(2, 60, 40, 30);
  const scrolls = log.filter((entry) => entry[0] === 'scroll');
  assert.equal(scrolls.length, 2);
  assert.ok(Math.abs(scrolls.reduce((sum, entry) => sum + entry[2], 0) - 0.1) < 1e-9, 'the middle went down by 20px = 0.1 of the width');
  pad.up(1, 60);
  pad.up(2, 60);
  assert.equal(log.some((entry) => entry[0] === 'click'), false);
});

test('cancel (the page lost the touch) lets a drag go', () => {
  const { pad, log } = make();
  pad.down(1, 10, 10, 0);
  pad.move(1, 40, 10, HOLD_MS + 20);
  pad.cancel();
  assert.deepEqual(log.at(-1), ['dragEnd']);
  assert.equal(pad.dragging, false);
});
