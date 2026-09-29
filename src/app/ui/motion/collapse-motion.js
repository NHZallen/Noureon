// Opening and closing a folded part eases (height and opacity) instead of
// jumping, unless the person asked for less motion. Used by the step list and
// by the "Ran code" and thinking lines.

const DURATION_MS = 200;

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
  const animation = node.animate(frames, { duration: DURATION_MS, easing: 'ease' });
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
    run(node, [closedFrame, openFrame(node)]);
    return;
  }
  if (node.hidden) return;
  run(node, [openFrame(node), closedFrame], () => { node.hidden = true; });
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
      run(content, [openFrame(content), closedFrame], () => { details.open = false; });
    } else {
      details.open = true;
      run(content, [closedFrame, openFrame(content)]);
    }
  });
  return details;
}

/**
 * Runs `update` (which adds to a scrolling box) and keeps the box at its end
 * only when the reader was already there, so reading further up is never
 * pulled down.
 */
export function keepEndInView(box, update) {
  const top = box.scrollTop;
  const atEnd = box.scrollHeight - top - box.clientHeight < 24;
  update();
  // Rewriting the text can reset the position; where the reader was is kept.
  box.scrollTop = atEnd ? box.scrollHeight : top;
}
