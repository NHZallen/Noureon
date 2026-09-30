// Opening and closing a folded part eases (height and opacity) instead of
// jumping, unless the person asked for less motion. Used by the step list and
// by the "Ran code" and thinking lines.

const DURATION_MS = 280;
// Quick to start, long to settle: the way accordions move in ChatGPT and Claude.
const EASING = 'cubic-bezier(0.25, 0.8, 0.25, 1)';

const prefersLessMotion = (node) => Boolean(node.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

const canAnimate = (node) => typeof node.animate === 'function' && !prefersLessMotion(node);

const settle = (node) => {
  node.style.overflow = '';
  node.__collapseAnimation = null;
};

// The vertical space a part takes when open (its height with margins and padding).
const openFrame = (node) => {
  const style = node.ownerDocument.defaultView.getComputedStyle(node);
  return {
    height: `${node.scrollHeight}px`,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    opacity: 1
  };
};

const closedFrame = { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 };

const run = (node, frames, onDone) => {
  node.style.overflow = 'hidden';
  const animation = node.animate(frames, { duration: DURATION_MS, easing: EASING });
  node.__collapseAnimation = animation;
  animation.onfinish = () => {
    // A finish that arrives after the part was moved on again is not for this animation.
    if (node.__collapseAnimation !== animation) return;
    onDone?.();
    settle(node);
  };
  animation.oncancel = () => settle(node);
};

/**
 * Shows or hides `node` (its hidden attribute). With `animate: false`, or
 * where animation is not available, it just switches.
 */
export function setCollapsed(node, show, { animate = true } = {}) {
  node.__collapseAnimation?.cancel();
  settle(node);
  if (!animate || !canAnimate(node)) {
    node.hidden = !show;
    return;
  }
  if (show) {
    if (!node.hidden) return;
    node.hidden = false;
    run(node, [closedFrame, { opacity: 1, offset: 0.6 }, openFrame(node)]);
    return;
  }
  if (node.hidden) return;
  run(node, [openFrame(node), { opacity: 0, offset: 0.5 }, closedFrame], () => { node.hidden = true; });
}

/** A label that changes (thinking → done) eases in instead of switching. */
export function softChange(node) {
  if (!canAnimate(node)) return;
  node.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 240, easing: EASING });
}

/**
 * Makes a details element (a summary and one part to show) ease open and
 * shut. A browser closes a details at once, so the click is taken over.
 */
export function animateDetails(details) {
  const summary = details.querySelector(':scope > summary');
  const content = details.querySelector(':scope > :not(summary)');
  if (!summary || !content) return details;
  summary.addEventListener('click', (event) => {
    if (!canAnimate(content)) return;
    event.preventDefault();
    content.__collapseAnimation?.cancel();
    settle(content);
    if (details.open) {
      run(content, [openFrame(content), { opacity: 0, offset: 0.5 }, closedFrame], () => { details.open = false; });
    } else {
      details.open = true;
      run(content, [closedFrame, { opacity: 1, offset: 0.6 }, openFrame(content)]);
    }
  });
  return details;
}

const READER_SETTLE_MS = 250; // a flick keeps scrolling after the finger lifts
const RETRY_MS = 120;

// Whether a person is dragging the box or it is still coasting from their flick. Touching a box while its text is
// rewritten (and its scroll position set) makes iPhone drop the gesture: the box "will not scroll".
function readerGuard(box) {
  if (box.__readerGuard) return box.__readerGuard;
  const guard = { holding: false, lastScroll: 0, own: false, pending: null, timer: null };
  box.__readerGuard = guard;
  if (typeof box.addEventListener !== 'function') return guard;
  const stamp = () => { guard.lastScroll = Date.now(); };
  box.addEventListener('touchstart', () => { guard.holding = true; stamp(); }, { passive: true });
  const release = () => { guard.holding = false; stamp(); };
  box.addEventListener('touchend', release, { passive: true });
  box.addEventListener('touchcancel', release, { passive: true });
  box.addEventListener('scroll', () => { if (!guard.own) stamp(); }, { passive: true });
  return guard;
}

/**
 * Runs `update` (which adds to a scrolling box) and keeps the box at its end
 * only when the reader was already there, so reading further up is never
 * pulled down. While someone is touching the box (or it is still coasting) the
 * update waits, and the latest one runs when they let go.
 */
export function keepEndInView(box, update) {
  const guard = readerGuard(box);
  guard.pending = update;
  if (guard.holding || Date.now() - guard.lastScroll < READER_SETTLE_MS) {
    if (guard.timer === null) {
      guard.timer = setTimeout(() => {
        guard.timer = null;
        const latest = guard.pending;
        guard.pending = null;
        if (latest) keepEndInView(box, latest);
      }, RETRY_MS);
    }
    return;
  }
  guard.pending = null;
  const top = box.scrollTop;
  const atEnd = box.scrollHeight - top - box.clientHeight < 24;
  update();
  // Rewriting the text can reset the position; where the reader was is kept.
  const target = atEnd ? box.scrollHeight : top;
  if (Math.abs(box.scrollTop - target) > 0.5) {
    guard.own = true;
    box.scrollTop = target;
    guard.own = false;
  }
}
