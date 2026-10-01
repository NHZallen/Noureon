import { followTop, isReaderScrolling, setScrollTopQuietly, watchReader } from '../../ui/motion/reader-scroll-guard.js';

// While a reply streams the chat follows its end, but only for a reader who is at the end, and it is never moved
// while a person is scrolling it: on iPhone, setting the position under a finger (or during a flick) stops the
// scroll, so the chat felt stuck while a reply was being written. The chat's own touch nudge is in
// chat-scroll-edges.js, so the guard here does not nudge it again.
export function createChatScrollPosition(elements) {
  const guarded = () => {
    const chatContainer = elements.chatContainer;
    if (chatContainer) watchReader(chatContainer, { nudge: false });
    return chatContainer;
  };
  const isChatNearBottom = (threshold = 16) => {
    const chatContainer = guarded();
    if (!chatContainer || isReaderScrolling(chatContainer)) return false;
    return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight <= threshold;
  };
  const keepChatPositionAfterRender = (shouldStick, previousTop) => {
    const chatContainer = guarded();
    if (!chatContainer) return;
    // Following rests a little short of the end, never on it: a finger that lands on a chat resting exactly at its end
    // is taken by the page on iPhone (see chat-scroll-edges.js).
    setScrollTopQuietly(chatContainer, shouldStick ? followTop(chatContainer) : previousTop);
  };
  return { isChatNearBottom, keepChatPositionAfterRender };
}
