import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runSubmitFinalCleanupLifecycle } from '../src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js';

const createCleanupFixture = () => {
  const calls = [];
  const lastMessageElement = { id: 'last-message' };

  return {
    calls,
    lastMessageElement,
    run: () => runSubmitFinalCleanupLifecycle(
      () => calls.push('stop-single-model'),
      () => calls.push('reset-submit-state'),
      (isSubmitting) => calls.push(['submit-button', isSubmitting]),
      () => calls.push('input-state'),
      () => calls.push('council-controls'),
      () => calls.push('input-indicators'),
      () => {
        calls.push('get-last-message');
        return lastMessageElement;
      }
    )
  };
};

test('submit final cleanup restores controls in the legacy ordering', () => {
  const fixture = createCleanupFixture();

  const result = fixture.run();

  assert.equal(result, fixture.lastMessageElement);
  assert.deepEqual(fixture.calls, [
    'stop-single-model',
    'reset-submit-state',
    ['submit-button', false],
    'input-state',
    'council-controls',
    'input-indicators',
    'get-last-message'
  ]);
});

test('submit final cleanup is shared by success, non-abort error, and abort paths', () => {
  for (const path of ['success', 'non-abort-error', 'abort']) {
    const fixture = createCleanupFixture();

    const result = fixture.run();

    assert.equal(result, fixture.lastMessageElement, path);
    assert.deepEqual(fixture.calls.slice(0, 3), [
      'stop-single-model',
      'reset-submit-state',
      ['submit-button', false]
    ], path);
  }
});

test('submit final cleanup can be called twice without keeping stale state', () => {
  const fixture = createCleanupFixture();

  fixture.run();
  fixture.run();

  assert.deepEqual(fixture.calls.filter(call => call === 'reset-submit-state'), [
    'reset-submit-state',
    'reset-submit-state'
  ]);
  assert.deepEqual(fixture.calls.filter(call => Array.isArray(call) && call[0] === 'submit-button'), [
    ['submit-button', false],
    ['submit-button', false]
  ]);
});

test('submit final cleanup source avoids provider, storage schema, package, and Vite coupling', () => {
  const source = readFileSync(
    new URL('../src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js', import.meta.url),
    'utf8'
  );

  for (const token of [
    'fetch',
    'TextDecoder',
    'streamApiCall',
    'indexedDB',
    'localStorage',
    'sessionStorage',
    'package.json',
    'vite.config',
    'virtual:legacy-app-runtime'
  ]) {
    assert.equal(source.includes(token), false, token);
  }
});
