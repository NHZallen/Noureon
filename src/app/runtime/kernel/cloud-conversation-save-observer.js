export function notifyCloudConversationSave(snapshot, syncOrMetadata, logger = console) {
  const sync = syncOrMetadata?.captureWorkspace
    ? syncOrMetadata
    : globalThis.__astraCloudSyncV2;
  const metadata = syncOrMetadata?.captureWorkspace ? null : syncOrMetadata;
  return sync?.captureWorkspace?.(snapshot, metadata || undefined);
}
