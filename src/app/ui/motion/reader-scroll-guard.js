// Scroll boxes that the app moves by itself (the chat following a reply, the thinking box following the
// thinking) must never be moved while a person is scrolling them, and must never rest exactly on an end when a
// finger lands on them.
//
// On iPhone, setting scrollTop while a finger is down, or while a flick is still coasting, stops the scroll dead.
// And a swipe that starts with a box exactly at its end is handed to the page instead of the box, so a box that
// follows new text (always exactly at its end) could not be scrolled at all. One pixel of room in both directions
// lets WebKit give every swipe to the box (measured on an iPhone for the chat, see chat-scroll-edges.js).

const SETTLE_MS = 250; // a flick keeps scrolling after the finger lifts; its scroll events push this forward

const nudgeOffEdges = (box) => {
  const max = box.scrollHeight - box.clientHeight;
  if (max <= 2) return;
  const top = box.scrollTop;
  if (top === 0) box.scrollTop = 1;
  else if (Math.abs(top - max) < 0.5) box.scrollTop = max - 1;
};

export function watchReader(box, { nudge = true } = {}) {
  if (!box) return null;
  if (box.__readerGuard) return box.__readerGuard;
  const guard = { holding: false, lastScroll: 0, own: false };
  box.__readerGuard = guard;
  if (typeof box.addEventListener !== 'function') return guard;
  const stamp = () => { guard.lastScroll = Date.now(); };
  box.addEventListener('touchstart', () => {
    guard.holding = true;
    stamp();
    if (nudge) {
      guard.own = true;
      nudgeOffEdges(box);
      guard.own = false;
    }
  }, { passive: true });
  const release = () => { guard.holding = false; stamp(); };
  box.addEventListener('touchend', release, { passive: true });
  box.addEventListener('touchcancel', release, { passive: true });
  box.addEventListener('scroll', () => { if (!guard.own) stamp(); }, { passive: true });
  return guard;
}

/** Whether a person is dragging the box, or it is still coasting from their flick. */
export function isReaderScrolling(box) {
  const guard = watchReader(box);
  return Boolean(guard && (guard.holding || Date.now() - guard.lastScroll < SETTLE_MS));
}

/** Moves the box, unless a person is scrolling it or it is already there. Returns whether it moved. */
export function setScrollTopQuietly(box, top) {
  if (!box || isReaderScrolling(box)) return false;
  if (Math.abs(box.scrollTop - top) <= 0.5) return false;
  const guard = watchReader(box);
  if (guard) guard.own = true;
  box.scrollTop = top;
  if (guard) guard.own = false;
  return true;
}
