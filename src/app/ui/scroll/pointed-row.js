// The row under the pointer in a list that scrolls. A browser works out what is under a still pointer only after a scroll
// has stopped, so a hover style lags behind the list (the old row stays grey while the rows move under the pointer). Here
// the row is found at every frame of the scroll and marked with a class the style uses instead of :hover.

const POINTED = 'is-pointed';

/** Keeps `.is-pointed` on the row of `container` (matching `itemSelector`) that is under the mouse. Returns a function that stops it. */
export function trackPointedRow(container, itemSelector) {
  const document = container.ownerDocument;
  const win = document.defaultView;
  let x = null;
  let y = null;
  let frame = 0;

  const apply = () => {
    frame = 0;
    const under = x === null ? null : document.elementFromPoint(x, y);
    const item = under?.closest?.(itemSelector);
    const row = item && container.contains(item) ? item : null;
    for (const old of container.querySelectorAll(`.${POINTED}`)) if (old !== row) old.classList.remove(POINTED);
    row?.classList.add(POINTED);
  };
  const later = () => {
    if (frame) return;
    if (win?.requestAnimationFrame) frame = win.requestAnimationFrame(apply);
    else apply();
  };
  const onMove = (event) => {
    // A finger leaves no pointer behind: no row stays marked after a tap.
    if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
    x = event.clientX;
    y = event.clientY;
    apply();
  };
  const onLeave = () => {
    x = null;
    y = null;
    apply();
  };
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerleave', onLeave);
  container.addEventListener('scroll', later, { passive: true });
  container.addEventListener('wheel', later, { passive: true });
  // The rows were drawn again (a new chat): the pointer may be over a different one now.
  const observer = win?.MutationObserver ? new win.MutationObserver(later) : null;
  observer?.observe(container, { childList: true, subtree: true });
  return () => {
    container.removeEventListener('pointermove', onMove);
    container.removeEventListener('pointerleave', onLeave);
    container.removeEventListener('scroll', later);
    container.removeEventListener('wheel', later);
    observer?.disconnect();
  };
}
