// The arrows at the two ends of a vertical scrollbar (the browsers that draw them, on Windows and Linux) take the list to its
// very top or very end instead of one small step. The browser reports a press on a scrollbar to the element that scrolls, so
// the press is told from a press on the element's own content by where it landed: in the strip the scrollbar takes, within
// one arrow's length of an end.

const MIN_ARROW = 12;
// Up and down take the same time, whatever the distance.
const DURATION = 500;

/** 'top', 'bottom' or '' for a press at (`x`, `y`) of a scroller: which scrollbar arrow it is on, when it is on one. */
export function scrollbarArrowAt(element, x, y) {
  const view = element?.ownerDocument?.defaultView;
  if (!view || !element.getBoundingClientRect) return '';
  const root = element === element.ownerDocument.documentElement || element === element.ownerDocument.body;
  const scroller = root ? element.ownerDocument.scrollingElement || element.ownerDocument.documentElement : element;
  if (!(scroller.scrollHeight > scroller.clientHeight)) return '';
  const style = view.getComputedStyle(root ? element.ownerDocument.documentElement : element);
  if (root ? false : !/^(auto|scroll|overlay)$/.test(style.overflowY)) return '';
  const rect = root ? { left: 0, top: 0, right: view.innerWidth } : element.getBoundingClientRect();
  const width = root ? view.innerWidth - scroller.clientWidth : element.offsetWidth - element.clientWidth - (element.clientLeft * 2 || 0);
  if (!(width > 0)) return '';
  const inside = y - rect.top - (root ? 0 : element.clientTop);
  const rtl = style.direction === 'rtl';
  const from = rtl ? rect.left + (root ? 0 : element.clientLeft) : rect.right - (root ? 0 : element.clientLeft) - width;
  if (x < from || x > from + width) return '';
  const arrow = Math.max(width, MIN_ARROW);
  if (inside >= 0 && inside < arrow) return 'top';
  if (inside > scroller.clientHeight - arrow && inside <= scroller.clientHeight) return 'bottom';
  return '';
}

// The list runs to its end instead of appearing there: half a second, eased in and out, stopped by
// any move of the reader's own (wheel, touch, a press, a key).
function scrollTo(element, top, win, smooth) {
  const start = element.scrollTop;
  const distance = top - start;
  const reduced = win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (!smooth || reduced || !win?.requestAnimationFrame || Math.abs(distance) < 2) {
    element.scrollTop = top;
    return;
  }
  const duration = DURATION;
  const began = win.performance?.now?.() ?? Date.now();
  let frame = 0;
  const stop = () => {
    if (frame) win.cancelAnimationFrame?.(frame);
    frame = 0;
    for (const type of ['wheel', 'touchstart', 'keydown']) element.removeEventListener(type, stop);
  };
  const step = (now) => {
    const progress = Math.min(1, ((now ?? Date.now()) - began) / duration);
    element.scrollTop = start + distance * (progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2);
    if (progress < 1) frame = win.requestAnimationFrame(step);
    else stop();
  };
  for (const type of ['wheel', 'touchstart', 'keydown']) element.addEventListener(type, stop, { passive: true, once: true });
  frame = win.requestAnimationFrame(step);
}

/** Makes every vertical scrollbar's arrows run to the top and to the end. */
export function installScrollbarArrows(document, { smooth = true } = {}) {
  const win = document.defaultView;
  const onPress = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const element = event.target;
    if (!element?.getBoundingClientRect) return;
    const direction = scrollbarArrowAt(element, event.clientX, event.clientY);
    if (!direction) return;
    const scroller = element === document.documentElement || element === document.body ? document.scrollingElement || document.documentElement : element;
    scrollTo(scroller, direction === 'top' ? 0 : scroller.scrollHeight, win, smooth);
  };
  document.addEventListener('mousedown', onPress, true);
  return () => document.removeEventListener('mousedown', onPress, true);
}
