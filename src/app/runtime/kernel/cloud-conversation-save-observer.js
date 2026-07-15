export function notifyCloudConversationSave(snapshot, syncOrMetadata, logger = console) {
  const sync = syncOrMetadata?.captureWorkspace
    ? syncOrMetadata
    : globalThis.__astraCloudSyncV2;
  const metadata = syncOrMetadata?.captureWorkspace ? null : syncOrMetadata;
  const captured = sync?.captureWorkspace?.(snapshot, metadata || undefined);
  if (!captured || metadata?.immediate !== true || typeof sync?.flush !== 'function') {
    return captured;
  }
  try {
    void Promise.resolve(sync.flush()).catch(error => {
      logger.warn('Noureon immediate cloud conversation sync remains queued for retry.', error);
    });
  } catch (error) {
    logger.warn('Noureon immediate cloud conversation sync remains queued for retry.', error);
  }
  return captured;
}
