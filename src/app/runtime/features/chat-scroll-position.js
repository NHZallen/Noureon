export function createChatScrollPosition(elements) {
  const isChatNearBottom = (threshold = 16) => {
    const chatContainer = elements.chatContainer;
    if (!chatContainer) return false;
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight <= threshold;
  };
  const keepChatPositionAfterRender = (shouldStick, previousTop) => {
    const chatContainer = elements.chatContainer;
    if (!chatContainer) return;
    if (shouldStick) chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
    else chatContainer.scrollTop = previousTop;
  };
  return { isChatNearBottom, keepChatPositionAfterRender };
}
