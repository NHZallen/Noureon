import assert from 'node:assert/strict';
import test from 'node:test';

import { revealArrival } from '../src/app/ui/motion/arrival-reveal.js';

test('the reveal class is on for a moment and then taken off, so a later redraw does not play it again', () => {
  const classes = new Set();
  const element = { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) } };
  const timers = [];
  assert.equal(revealArrival(element, 'is-arriving', { ms: 900, schedule: (callback, delay) => timers.push([callback, delay]) }), true);
  assert.deepEqual([...classes], ['is-arriving']);
  assert.equal(timers[0][1], 900);
  timers[0][0]();
  assert.deepEqual([...classes], []);
  assert.equal(revealArrival(null, 'is-arriving'), false, 'nothing to reveal');
});
