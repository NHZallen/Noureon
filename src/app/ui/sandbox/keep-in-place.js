// Keeps a card where it is on the screen while it changes its size (the browser card turning into its pill and back): the conversation does not scroll under it.
// When the card is the last thing in the conversation, a shorter card would pull the scroll position back (the page cannot scroll further than its end) and the card would
// jump down; so the room it loses is kept for it below (as padding) until it grows again.

const scrollParent = (element, view) => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = view?.getComputedStyle?.(node)?.overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight - 1) return node;
  }
  return null;
};

/** Runs `change()` (which changes the size of `element`) and puts the page back so `element` stays at the same place. `release`: the card is not shrunk any more, the room kept for it is let go. */
export function keepInPlace(element, change, { release = false } = {}) {
  const view = element.ownerDocument?.defaultView;
  const scroller = scrollParent(element, view);
  if (!scroller) { if (release) element.style.paddingBottom = ''; change(); return; }
  const before = element.getBoundingClientRect().top;
  if (release) element.style.paddingBottom = '';
  change();
  let moved = element.getBoundingClientRect().top - before;
  if (Math.abs(moved) <= 0.5) return;
  const top = scroller.scrollTop;
  scroller.scrollTop = top + moved;
  moved = element.getBoundingClientRect().top - before;
  if (moved > 0.5) {
    // The page could not follow: its end came closer. The room is given back at the card, then the page goes with it.
    const have = parseFloat(element.style.paddingBottom) || 0;
    element.style.paddingBottom = `${have + moved}px`;
    scroller.scrollTop += moved;
  }
}
