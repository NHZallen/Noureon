import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/runtime/features/p2p-lifecycle.js', import.meta.url), 'utf8');

test('the code of a share comes from the random numbers of the browser, not from Math.random', () => {
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /getRandomValues\(new Uint32Array\(1\)\)\[0\] \/ 4294967296/);
  assert.match(source, /const randomValue = random \?\? secureRandom;/);
});

test('the number it gives is at least 0 and below 1, as the code generator needs', () => {
  const draw = (value) => value / 4294967296;
  assert.equal(draw(0), 0);
  assert.ok(draw(4294967295) < 1);
  // 32 letters and digits: 32 divides 2 ** 32, so every one of them is equally likely
  assert.equal(4294967296 % 32, 0);
});
