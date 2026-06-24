import assert from 'node:assert/strict';
import test from 'node:test';

import { createLegacyRuntimeContext } from '../src/app/legacy-runtime/runtime/legacy-runtime-context.js';

test('lazy bindings resolve only when requested and return the latest value', () => {
  const context = createLegacyRuntimeContext();
  let reads = 0;
  let currentValue = 'first';

  context.registerLazyBinding('example.value', () => {
    reads += 1;
    return currentValue;
  });

  assert.equal(reads, 0);
  assert.equal(context.resolveBinding('example.value'), 'first');
  assert.equal(reads, 1);

  currentValue = 'second';
  assert.equal(context.resolveBinding('example.value'), 'second');
  assert.equal(reads, 2);
});

test('value bindings preserve function values without invoking them', () => {
  const context = createLegacyRuntimeContext();
  const callback = () => 'called';

  context.registerValueBinding('example.callback', callback);

  assert.equal(context.resolveBinding('example.callback'), callback);
  assert.equal(context.resolveBinding('example.callback')(), 'called');
});

test('missing required and optional bindings have explicit behavior', () => {
  const context = createLegacyRuntimeContext();

  assert.throws(
    () => context.resolveBinding('missing.required'),
    /Legacy runtime binding "missing\.required" is not registered/
  );
  assert.equal(context.resolveOptionalBinding('missing.optional'), undefined);
  assert.equal(context.resolveOptionalBinding('missing.optional', 'fallback'), 'fallback');
});

test('duplicate binding registration is rejected', () => {
  const context = createLegacyRuntimeContext();

  context.registerValueBinding('example.duplicate', 1);

  assert.throws(
    () => context.registerLazyBinding('example.duplicate', () => 2),
    /Legacy runtime binding "example\.duplicate" is already registered/
  );
});

test('binding names and lazy getters are validated', () => {
  const context = createLegacyRuntimeContext();

  assert.throws(() => context.registerValueBinding('', 1), /non-empty string/);
  assert.throws(() => context.registerLazyBinding('example.invalid', 1), /must be a function/);
});
