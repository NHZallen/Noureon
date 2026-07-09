export function notifyCloudConversationSave(snapshot, sync = globalThis.__astraCloudSyncV2, logger = console) {
  const captured = sync?.captureWorkspace?.(snapshot);
  if (captured && typeof sync?.flush === 'function') {
    Promise.resolve()
      .then(() => sync.flush())
      .catch(error => logger.warn('Noureon cloud conversation sync flush failed after local save:', error));
  }
  return captured;
}
