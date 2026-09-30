// Keeps the chat one pixel off its ends whenever a finger lands on it. On iPhone, a swipe that starts with the
// scroller exactly at its end is sometimes handed to the page instead of the chat: with
// overscroll-behavior: contain the chat then sprang back to the bottom after the finger lifted, and
// without it the page moved and the chat did not. One pixel of room in both directions lets WebKit give
// every swipe to the chat. Measured on a device with on-screen scroll diagnostics.

export function keepChatOffItsEdges(scroller) {
  if (!scroller || typeof scroller.addEventListener !== 'function') return () => {};
  const nudge = () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 2) return;
    if (scroller.scrollTop <= 0) scroller.scrollTop = 1;
    else if (scroller.scrollTop >= max - 0.5) scroller.scrollTop = max - 1;
  };
  scroller.addEventListener('touchstart', nudge, { passive: true });
  return () => scroller.removeEventListener('touchstart', nudge);
}
