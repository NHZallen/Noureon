let workspaceStorageQueue = Promise.resolve();

export function withWorkspaceStorageExclusive(operation) {
  const result = workspaceStorageQueue
    .catch(() => {})
    .then(operation);
  workspaceStorageQueue = result.catch(() => {});
  return result;
}
