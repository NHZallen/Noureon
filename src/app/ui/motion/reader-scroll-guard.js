// Scroll boxes that the app moves by itself (the chat following a reply, the thinking box following the
// thinking) must never be moved while a person is scrolling them, and must never rest exactly on an end when a
// finger lands on them.
//
// On iPhone, setting scrollTop while a finger is down, or while a flick is still coasting, stops the scroll dead.
// And a swipe that starts with a box exactly at its end is handed to the page instead of the box, so a box that
// follows new text (always exactly at its end) could not be scrolled at all. One pixel of room in both directions
// lets WebKit give every swipe to the box (measured on an iPhone for the chat, see chat-scroll-edges.js).

const SETTLE_MS = 250; // a flick keeps scrolling after the finger lifts; its scroll events push this forward

// The scroll event for a position the app set arrives a frame later, so the app's own moves are known by where
// they land, not by a flag around the assignment.
const moveBox = (box, guard, top) => {
  guard.expected = top;
  box.scrollTop = top;
};

const nudgeOffEdges = (box, guard = { expected: null }) => {
  const max = box.scrollHeight - box.clientHeight;
  if (max <= 2) return;
  const top = box.scrollTop;
  if (top === 0) moveBox(box, guard, 1);
  else if (Math.abs(top - max) < 0.5) moveBox(box, guard, max - 1);
};

export function watchReader(box, { nudge = true } = {}) {
  if (!box) return null;
  if (box.__readerGuard) return box.__readerGuard;
  const guard = { holding: false, lastScroll: 0, expected: null, pinned: false };
  box.__readerGuard = guard;
  if (typeof box.addEventListener !== 'function') return guard;
  const stamp = () => { guard.lastScroll = Date.now(); };
  box.addEventListener('touchstart', () => {
    guard.pinned = false;
    guard.holding = true;
    stamp();
    if (nudge) nudgeOffEdges(box, guard);
  }, { passive: true });
  const release = () => { guard.holding = false; stamp(); };
  box.addEventListener('wheel', () => { guard.pinned = false; }, { passive: true });
  box.addEventListener('touchend', release, { passive: true });
  box.addEventListener('touchcancel', release, { passive: true });
  box.addEventListener('scroll', () => {
    if (guard.expected !== null && Math.abs(box.scrollTop - guard.expected) <= 1) {
      guard.expected = null;
      return;
    }
    guard.expected = null;
    stamp();
  }, { passive: true });
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
  if (guard) moveBox(box, guard, top);
  else box.scrollTop = top;
  return true;
}

/** Whether the box is following its end: it was sent there, or is resting there, and the reader has not scrolled since. */
export function isFollowingEnd(box, threshold = 24) {
  const guard = watchReader(box);
  return Boolean(guard?.pinned) || box.scrollHeight - box.scrollTop - box.clientHeight < threshold;
}

/** Sends the box to its newest end and keeps it following from there until the reader scrolls it. */
export function pinToEnd(box) {
  const guard = watchReader(box);
  if (!guard) return;
  guard.pinned = true;
  const max = box.scrollHeight - box.clientHeight;
  moveBox(box, guard, Math.max(0, max - (max > 2 ? 1 : 0)));
}

const NUDGED_BOXES = '.ledger-thought, .ledger-code, .ledger-output';

/**
 * One listener for every box the app fills with thinking, code or output, also the ones saved with a reply and
 * opened later: a finger landing on one that rests exactly at its end moves it one pixel off that end, so an
 * iPhone gives the swipe to the box (the thinking box "could not be scrolled" from its bottom).
 */
export function keepScrollBoxesOffTheirEdges(doc = document) {
  const onTouchStart = (event) => {
    const box = event.target?.closest?.(NUDGED_BOXES);
    if (box) nudgeOffEdges(box, box.__readerGuard);
  };
  doc.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  return () => doc.removeEventListener('touchstart', onTouchStart, { capture: true });
}
