import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKSPACE_STORAGE_LOCK_NAME,
  createWorkspaceStorageCoordinator
} from '../src/app/sync/workspace-storage-coordinator.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createSharedLockManager() {
  let queue = Promise.resolve();
  const calls = [];
  return {
    calls,
    request(name, options, operation) {
      calls.push({ name, options });
      const result = queue.catch(() => {}).then(operation);
      queue = result.catch(() => {});
      return result;
    }
  };
}

test('separate page coordinators serialize through one exclusive Web Lock', async () => {
  const lockManager = createSharedLockManager();
  const pageA = createWorkspaceStorageCoordinator({ lockManager });
  const pageB = createWorkspaceStorageCoordinator({ lockManager });
  const releaseA = deferred();
  const enteredA = deferred();
  const order = [];

  const operationA = pageA.withWorkspaceStorageExclusive(async () => {
    order.push('a:start');
    enteredA.resolve();
    await releaseA.promise;
    order.push('a:end');
  });
  await enteredA.promise;
  const operationB = pageB.withWorkspaceStorageExclusive(async () => {
    order.push('b');
  });
  await Promise.resolve();

  assert.deepEqual(order, ['a:start']);
  releaseA.resolve();
  await Promise.all([operationA, operationB]);

  assert.deepEqual(order, ['a:start', 'a:end', 'b']);
  assert.deepEqual(lockManager.calls, [
    { name: WORKSPACE_STORAGE_LOCK_NAME, options: { mode: 'exclusive' } },
    { name: WORKSPACE_STORAGE_LOCK_NAME, options: { mode: 'exclusive' } }
  ]);
});

test('same-page fallback remains serialized when Web Locks are unavailable', async () => {
  const coordinator = createWorkspaceStorageCoordinator({ lockManager: null });
  const firstRelease = deferred();
  const firstEntered = deferred();
  const order = [];

  const first = coordinator.withWorkspaceStorageExclusive(async () => {
    order.push('first:start');
    firstEntered.resolve();
    await firstRelease.promise;
    order.push('first:end');
  });
  const second = coordinator.withWorkspaceStorageExclusive(async () => {
    order.push('second');
  });
  await firstEntered.promise;

  assert.deepEqual(order, ['first:start']);
  firstRelease.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second']);
});

test('a failed operation does not poison the following workspace lock', async () => {
  const lockManager = createSharedLockManager();
  const coordinator = createWorkspaceStorageCoordinator({ lockManager });

  await assert.rejects(
    coordinator.withWorkspaceStorageExclusive(async () => {
      throw new Error('write failed');
    }),
    /write failed/
  );

  assert.equal(
    await coordinator.withWorkspaceStorageExclusive(async () => 'recovered'),
    'recovered'
  );
});

test('invalid workspace operations reject before requesting a lock', async () => {
  const lockManager = createSharedLockManager();
  const coordinator = createWorkspaceStorageCoordinator({ lockManager });

  await assert.rejects(
    coordinator.withWorkspaceStorageExclusive(null),
    /must be a function/
  );
  assert.equal(lockManager.calls.length, 0);
});
