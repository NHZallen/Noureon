export const WORKSPACE_STORAGE_LOCK_NAME = 'noureon-workspace-storage-v1';

export function createWorkspaceStorageCoordinator({
  lockManager = globalThis.navigator?.locks,
  lockName = WORKSPACE_STORAGE_LOCK_NAME
} = {}) {
  let workspaceStorageQueue = Promise.resolve();

  function withWorkspaceStorageExclusive(operation) {
    if (typeof operation !== 'function') {
      return Promise.reject(new TypeError('Workspace storage operation must be a function.'));
    }

    const run = () => typeof lockManager?.request === 'function'
      ? lockManager.request(lockName, { mode: 'exclusive' }, operation)
      : operation();
    const result = workspaceStorageQueue
      .catch(() => {})
      .then(run);
    workspaceStorageQueue = result.catch(() => {});
    return result;
  }

  return { withWorkspaceStorageExclusive };
}

const defaultCoordinator = createWorkspaceStorageCoordinator();

export const withWorkspaceStorageExclusive = operation => (
  defaultCoordinator.withWorkspaceStorageExclusive(operation)
);
