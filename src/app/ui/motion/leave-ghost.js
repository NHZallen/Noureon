// A thing that leaves the page is gone at once, and its picture goes out softly (docs/superpowers/specs/2026-11-11-interaction-overhaul-design.md §5, phase 3 and 7).
// The real element is removed by the caller as before, so what the page asks of it (the next sheet, the Escape key, a count of the open ones) is not delayed; a copy is
// left where it was, cannot be touched, and is taken away when its animation ends. Nothing is left for a person who asked for less motion, for an action started from
// the keyboard (`html.is-instant`), or where the browser cannot animate. Page only.

export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const SLACK_MS = 120;

/**
 * `steps` are [{ target (a selector inside the copy, or null for the copy itself), keyframes, duration, easing? }]. Returns true when a copy was left.
 * Call it before the element is removed.
 */
export function leaveGhost(node, steps) {
  const doc = node?.ownerDocument;
  const view = doc?.defaultView;
  if (!node?.isConnected || !node.parentNode || typeof node.animate !== 'function' || !view) return false;
  if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches || doc.documentElement.classList.contains('is-instant')) return false;
  const ghost = node.cloneNode(true);
  ghost.setAttribute('data-ghost', '');
  ghost.setAttribute('inert', '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.removeAttribute('id');
  ghost.style.pointerEvents = 'none';
  node.parentNode.insertBefore(ghost, node);
  const longest = Math.max(...steps.map((step) => step.duration));
  const remove = () => ghost.remove();
  for (const step of steps) {
    const element = step.target ? ghost.querySelector(step.target) : ghost;
    if (!element) continue;
    const animation = element.animate(step.keyframes, { duration: step.duration, easing: step.easing || EASE_OUT, fill: 'forwards' });
    if (step.duration === longest) { animation.onfinish = remove; animation.oncancel = remove; }
  }
  view.setTimeout(remove, longest + SLACK_MS);
  return true;
}

const fade = (duration) => ({ target: null, keyframes: [{ opacity: 1 }, { opacity: 0 }], duration });

/** The usual ways out. */
export const leaving = {
  // A menu or a small box at a button: it shrinks a little toward its corner (`transform-origin` is set on it when it is opened).
  menu: (node) => leaveGhost(node, [{ target: null, keyframes: [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.97' }], duration: 120 }]),
  // A dialog in the middle: the dim layer fades, the box shrinks a little.
  dialog: (node) => leaveGhost(node, [fade(150), { target: '.pj-sheet', keyframes: [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.97' }], duration: 150 }]),
  // A sheet that is a page over the page (on a computer it is a dialog: the copy fades and its box shrinks a little).
  page: (node) => leaveGhost(node, [{ target: null, keyframes: [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 0.75rem' }], duration: 150 }]),
  // A list of choices from below.
  bottom: (node) => leaveGhost(node, [fade(220), { target: '.pj-sheet', keyframes: [{ translate: '0 0' }, { translate: '0 100%' }], duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }])
};
