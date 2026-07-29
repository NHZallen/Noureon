/** Adds source disclosure to the completed streamed message without replacing it. */
export function replaceHistorySourceMessage({
  finalAiMessage,
  loadingMessageDiv,
  refreshMessageHistorySources
} = {}) {
  if (!loadingMessageDiv?.isConnected || typeof refreshMessageHistorySources !== 'function') return null;
  return refreshMessageHistorySources(loadingMessageDiv, finalAiMessage) || null;
}
