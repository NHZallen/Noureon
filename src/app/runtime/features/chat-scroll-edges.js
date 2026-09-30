// Keeps the chat off its end whenever a finger lands on it. On iPhone, a swipe that starts with the scroller exactly at
// its end is sometimes handed to the page instead of the chat: with overscroll-behavior: contain the chat then sprang
// back to the bottom after the finger lifted, and without it the page moved and the chat did not. A chat that rests a
// little off its end takes every swipe. It is taken off the end by giving it more range there (see
// reader-scroll-guard.js), never by moving it: writing the position as the finger lands stops that swipe dead, and a
// move a moment after the chat stopped shows as a tick. The room is given as the chat arrives at its end
// (settleScrollBoxesOffTheirEdges), because a swipe can begin within milliseconds of it stopping; this covers a finger
// that still lands on it before that.

import { giveEndRoom } from '../../ui/motion/reader-scroll-guard.js';

export function keepChatOffItsEdges(scroller) {
  if (!scroller || typeof scroller.addEventListener !== 'function') return () => {};
  const onTouchStart = () => { giveEndRoom(scroller); };
  scroller.addEventListener('touchstart', onTouchStart, { passive: true });
  return () => scroller.removeEventListener('touchstart', onTouchStart);
}
