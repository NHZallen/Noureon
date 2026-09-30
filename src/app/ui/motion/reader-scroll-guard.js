// Scroll boxes that the app moves by itself (the chat following a reply, the thinking box following the
// thinking) must never be moved while a person is scrolling them, and must never rest exactly on an end when a
// finger lands on them.
//
// On iPhone, setting scrollTop while a finger is down, or while a flick is still coasting, stops the scroll dead.
// And a swipe that starts with a box exactly at its end is handed to the page instead of the box, so a box that
// follows new text (always exactly at its end) could not be scrolled at all. One pixel of room in both directions
// lets WebKit give every swipe to the box (measured on an iPhone for the chat, see chat-scroll-edges.js).

// How far off an end a box is kept. One pixel was enough for the chat; a thinking box's height and content are
// often fractions of a pixel, so its real end can be a fraction short of the reported one, and two pixels of room
// leave a clear gap on both sides.
export const EDGE_ROOM = 2;

const SETTLE_MS = 250; // a flick keeps scrolling after the finger lifts; its scroll events push this forward

// The scroll event for a position the app set arrives a frame later, so the app's own moves are known by where
// they land, not by a flag around the assignment.
const moveBox = (box, guard, top) => {
  guard.expected = top;
  box.scrollTop = top;
};

const nudgeOffEdges = (box, guard = { expected: null }) => {
  const max = box.scrollHeight - box.clientHeight;
  if (max <= EDGE_ROOM * 2) return;
  const top = box.scrollTop;
  // Anything within a hair of an end counts as resting on it (fractional positions), not only exactly on it.
  if (top < 1) moveBox(box, guard, EDGE_ROOM);
  else if (top > max - 1) moveBox(box, guard, max - EDGE_ROOM);
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

/** Where a box that follows its end rests: a little short of the end, never on it. */
export function followTop(box) {
  const max = box.scrollHeight - box.clientHeight;
  return Math.max(0, max - (max > EDGE_ROOM * 2 ? EDGE_ROOM : 0));
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
  moveBox(box, guard, followTop(box));
}

const NUDGED_BOXES = '.ledger-thought, .ledger-code, .ledger-output';
const STILL_MS = 160;

/**
 * A scroll box that has come to rest within a pixel of an end goes two pixels off it, once it is still and no finger
 * is on the screen. The nudge when a finger lands (keepScrollBoxesOffTheirEdges, chat-scroll-edges.js) is too late:
 * measured on an iPhone, writing the position as the finger lands stops that swipe dead (the next swipe, from the
 * position it left, scrolls). Boxes reach an end by the reader's own fling, by opening a chat or by following new
 * text, so the place to move them is when they stop. Scroll events do not bubble, so one listener on the page
 * catches them on the way down.
 */
export function settleScrollBoxesOffTheirEdges(doc = document, { selector = `${NUDGED_BOXES}, #chat-container`, view = doc.defaultView, glide = true } = {}) {
  if (!view || typeof doc.addEventListener !== 'function') return () => {};
  const timers = new WeakMap();
  let touching = 0;
  const settle = (box) => {
    timers.delete(box);
    // A finger on the screen, even one held still, is not the time to move anything.
    if (touching > 0) {
      timers.set(box, view.setTimeout(() => settle(box), STILL_MS));
      return;
    }
    const max = box.scrollHeight - box.clientHeight;
    if (max <= EDGE_ROOM * 2) return;
    const top = box.scrollTop;
    const guard = watchReader(box, { nudge: false });
    if (!guard) return;
    // Past an end (still bouncing) is left alone.
    let target = null;
    if (top >= 0 && top < 1 && top !== EDGE_ROOM) target = EDGE_ROOM;
    else if (top <= max && top > max - 1) target = max - EDGE_ROOM;
    if (target === null) return;
    // A jump of two pixels a moment after the scrolling stopped shows as a tick; glided, it is not seen.
    const reduced = Boolean(view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    if (glide && !reduced && typeof box.scrollTo === 'function') {
      guard.expected = target;
      box.scrollTo({ top: target, behavior: 'smooth' });
    } else {
      moveBox(box, guard, target);
    }
  };
  const onScroll = (event) => {
    const target = event.target;
    const box = target?.nodeType === 1 ? (target.matches?.(selector) ? target : target.closest?.(selector)) : null;
    if (!box) return;
    const pending = timers.get(box);
    if (pending !== undefined) view.clearTimeout(pending);
    timers.set(box, view.setTimeout(() => settle(box), STILL_MS));
  };
  const down = () => { touching += 1; };
  const up = () => { touching = Math.max(0, touching - 1); };
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  doc.addEventListener('touchstart', down, { capture: true, passive: true });
  doc.addEventListener('touchend', up, { capture: true, passive: true });
  doc.addEventListener('touchcancel', up, { capture: true, passive: true });
  return () => {
    doc.removeEventListener('scroll', onScroll, { capture: true });
    doc.removeEventListener('touchstart', down, { capture: true });
    doc.removeEventListener('touchend', up, { capture: true });
    doc.removeEventListener('touchcancel', up, { capture: true });
  };
}

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
