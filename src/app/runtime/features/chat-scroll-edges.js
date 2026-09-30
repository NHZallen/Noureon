// Keeps the chat a little off its ends whenever a finger lands on it. On iPhone, a swipe that starts with the
// scroller exactly at its end is sometimes handed to the page instead of the chat: with
// overscroll-behavior: contain the chat then sprang back to the bottom after the finger lifted, and
// without it the page moved and the chat did not. Room in both directions lets WebKit give
// every swipe to the chat. Measured on an iPhone with on-screen scroll diagnostics: with this, every swipe
// that started at the bottom stayed where it was left, and none went to the page.

// Two pixels, like the thinking and code boxes (reader-scroll-guard.js): positions are fractions of a pixel on a phone,
// and the end the page reports can be a little past the one the screen has, so a chat resting within a pixel of its end
// (not only exactly on it) is treated as resting on it, and is moved far enough to leave a clear gap.
const EDGE_ROOM = 2;

export function keepChatOffItsEdges(scroller) {
  if (!scroller || typeof scroller.addEventListener !== 'function') return () => {};
  const nudge = () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= EDGE_ROOM * 2) return;
    // Only when resting on an end: while it is still bouncing past one (above 0 or below the bottom), moving it
    // would cut the bounce short.
    const top = scroller.scrollTop;
    if (top >= 0 && top < 1) scroller.scrollTop = EDGE_ROOM;
    else if (top <= max && top > max - 1) scroller.scrollTop = max - EDGE_ROOM;
  };
  scroller.addEventListener('touchstart', nudge, { passive: true });
  return () => scroller.removeEventListener('touchstart', nudge);
}
