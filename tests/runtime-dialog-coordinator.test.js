import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createRuntimeDialogCoordinator } from '../src/app/legacy-runtime/runtime/runtime-dialog-coordinator.js';

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('showNotification forwards args and return value to the injected callback', () => {
  const calls = [];
  const coordinator = createRuntimeDialogCoordinator({
    showNotification: (...args) => {
      calls.push(args);
      return 'notification-result';
    }
  });

  const result = coordinator.showNotification('Saved', 'success', { id: 'toast-1' });

  assert.equal(result, 'notification-result');
  assert.deepEqual(calls, [['Saved', 'success', { id: 'toast-1' }]]);
});

test('repeated showNotification calls preserve args and order', () => {
  const calls = [];
  const coordinator = createRuntimeDialogCoordinator({
    showNotification: (...args) => calls.push(args)
  });

  coordinator.showNotification('First', 'info');
  coordinator.showNotification('Second', 'warning');

  assert.deepEqual(calls, [
    ['First', 'info'],
    ['Second', 'warning']
  ]);
});

test('missing showNotification callback warns explicitly and remains a no-op', () => {
  const warnings = [];
  const coordinator = createRuntimeDialogCoordinator({
    logger: {
      warn: (...args) => warnings.push(args)
    }
  });

  const result = coordinator.showNotification('Missing callback', 'error');

  assert.equal(result, undefined);
  assert.deepEqual(warnings, [['[legacy-runtime] showNotification callback is not available']]);
});

test('runtime dialog coordinator source avoids unrelated runtime systems', () => {
  const source = readSource('src/app/legacy-runtime/runtime/runtime-dialog-coordinator.js');

  assert.match(source, /export\s+function\s+createRuntimeDialogCoordinator/);
  assert.doesNotMatch(source, /\bdocument\b|\bwindow\b|innerHTML|classList|setTimeout|requestAnimationFrame/);
  assert.doesNotMatch(source, /provider|parser|api|storage|package|vite|css|template/i);
  assert.doesNotMatch(source, /toggleModal|showCustomConfirm|showCustomPrompt/);
});
