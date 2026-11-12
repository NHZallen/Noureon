// The way out of a panel on a phone, played by the browser's own animation (`element.animate`) in addition to the CSS transition of the state change. Some browsers (the iPhone's) do not show a
// CSS transition for a panel that is put away by a script in the same frame; this one is shown by all of them. It ends where the state of the page already is, so nothing is left behind.
// Nothing is played when the person asked for less motion, for what the keyboard started (`html.is-instant`), or where the browser cannot animate. Page only.

export function playExit(element, keyframes, { duration = 300, easing = 'cubic-bezier(0.32, 0.72, 0, 1)' } = {}) {
  const doc = element?.ownerDocument;
  const view = doc?.defaultView;
  if (!view || typeof element.animate !== 'function') return false;
  if (view.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || doc.documentElement.classList.contains('is-instant')) return false;
  try {
    element.animate(keyframes, { duration, easing, fill: 'none' });
    return true;
  } catch {
    return false;
  }
}
