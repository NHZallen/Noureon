/** Replaces only the streamed placeholder with its final source-aware view. */
export function replaceHistorySourceMessage({
  finalAiMessage,
  conversation,
  loadingMessageDiv,
  addMessageToUI
} = {}) {
  const finalMessageElement = addMessageToUI?.(finalAiMessage, (conversation?.messages?.length || 1) - 1, false, false);
  if (loadingMessageDiv?.isConnected && finalMessageElement) {
    loadingMessageDiv.replaceWith(finalMessageElement);
  }
  return finalMessageElement || null;
}
