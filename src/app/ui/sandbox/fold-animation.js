// How a block of the step list or the reply closes: it eases to its new height (or away) instead of jumping, so the page does not seem to move by itself.
// Without the animation API (or when the person asks for less motion) the change is simply made.

const DURATION_MS = 260;
const EASING = 'cubic-bezier(.2, .8, .2, 1)';

const canAnimate = (node) => typeof node?.animate === 'function' && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** Runs `apply()` (which changes what `node` holds) and eases the node from its height before to its height after. */
export function foldAnimated(node, apply) {
  const before = canAnimate(node) ? node.getBoundingClientRect().height : 0;
  apply();
  if (!before) return;
  const after = node.getBoundingClientRect().height;
  if (!after || Math.abs(after - before) < 2) return;
  const { overflow, boxSizing } = node.style;
  node.style.overflow = 'hidden';
  node.style.boxSizing = 'border-box';
  const restore = () => { node.style.overflow = overflow; node.style.boxSizing = boxSizing; };
  const animation = node.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: DURATION_MS, easing: EASING });
  animation.onfinish = restore;
  animation.oncancel = restore;
  // What it now holds comes in a little after the height starts to move.
  node.firstElementChild?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS - 60, delay: 60, easing: 'ease', fill: 'backwards' });
}

/** Takes `node` away: it fades and folds up, then leaves the page. */
export function leave(node) {
  if (!node?.isConnected) return;
  if (!canAnimate(node)) {
    node.remove();
    return;
  }
  const height = node.getBoundingClientRect().height;
  node.style.overflow = 'hidden';
  node.style.boxSizing = 'border-box';
  node.style.pointerEvents = 'none';
  const animation = node.animate([
    { height: `${height}px`, opacity: 1 },
    { height: '0px', opacity: 0, marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px' }
  ], { duration: DURATION_MS, easing: EASING, fill: 'forwards' });
  animation.onfinish = () => node.remove();
  animation.oncancel = () => node.remove();
}
