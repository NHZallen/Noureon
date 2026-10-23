import assert from 'node:assert/strict';
import test from 'node:test';

import { expectArrival, takeArrival } from '../src/app/runtime/messages/arriving-messages.js';

test('an expected message is taken once, and only within the time given', () => {
  let clock = 1000;
  const now = () => clock;
  expectArrival('a', { now, ms: 500 });
  assert.equal(takeArrival('a', { now }), true);
  assert.equal(takeArrival('a', { now }), false, 'taken once');
  expectArrival('b', { now, ms: 500 });
  clock += 600;
  assert.equal(takeArrival('b', { now }), false, 'too late');
  assert.equal(takeArrival('never', { now }), false, 'nobody expected it');
  expectArrival('', { now });
  assert.equal(takeArrival('', { now }), false);
});
