// On a phone the page does not shrink when the keyboard comes up: the phone slides what is seen (the visual viewport) up over a page that keeps
// its full height, so the app, fixed to the whole page, had its box covered by the keyboard and its top slid out of sight. This hands the app
// where the seen area ends (--vv-bottom on <html>: the top of the keyboard in the page's measures), and styles/layout.css makes the app end
// there, from the top of the page.
// That end moves when the page is moved (measured on an iPhone: offsetTop rises with scrollY, the seen height stays), and the
// app can only follow a frame late, so a page dragged by a finger made the composer jump 10 to 30 pixels on every frame. With the keyboard up the
// page is about twice as tall as what is seen, and a finger on anything that does not scroll (the composer's frame, an empty chat) dragged all
// of it: every jump in the recordings came between a touchstart and its touchend, and the page's own code asked for no scroll at all. So while
// the page can be dragged, a finger that would drag it is held (the boxes that scroll still scroll, and two fingers still zoom).
// Chrome on iPhone also puts its own bar (the cog, the arrows and the tick) over the foot of the page while a box is being typed in, and the
// page is not told of it, so that much is kept free at the foot while the keyboard is up.

const KEYBOARD_MIN_HEIGHT = 100; // what the visible height must lose before it is taken for a keyboard
const CHROME_IOS_ACCESSORY_BAR = 48;

const isTypingTarget = (element) => Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));

/** Whether something under the finger, or around it, can still scroll the way the finger goes (dy > 0: the finger moves down, the box toward its top). */
const scrollsToward = (win, start, stop, dy) => {
  for (let node = start; node && node !== stop; node = node.parentElement) {
    if (node.nodeType !== 1) continue;
    const range = node.scrollHeight - node.clientHeight;
    if (range <= 1) continue;
    const overflow = win.getComputedStyle?.(node)?.overflowY;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    if (dy > 0 ? node.scrollTop > 0 : node.scrollTop < range - 1) return true;
  }
  return false;
};

export function installViewportLock(win = window, doc = document) {
  const viewport = win?.visualViewport;
  if (!viewport || !doc?.documentElement) return () => {};
  const root = doc.documentElement;
  const chromeOnIphone = /CriOS/.test(win.navigator?.userAgent || '');
  let frame = 0;

  const sync = () => {
    frame = 0;
    // A page the person has zoomed is left as it is.
    if (Math.abs((viewport.scale || 1) - 1) > 0.01) {
      root.style.removeProperty('--vv-bottom');
      return;
    }
    // Where the seen area ends in the page's own measures: the same whether or not the phone has slid the page.
    const seenBottom = (viewport.offsetTop || 0) + viewport.height;
    const keyboardUp = isTypingTarget(doc.activeElement) && (win.innerHeight || 0) - seenBottom > KEYBOARD_MIN_HEIGHT;
    const reserved = keyboardUp && chromeOnIphone ? CHROME_IOS_ACCESSORY_BAR : 0;
    root.style.setProperty('--vv-bottom', `${Math.max(0, Math.round(seenBottom - reserved))}px`);
  };
  const queue = () => {
    if (frame) return;
    if (typeof win.requestAnimationFrame !== 'function') {
      sync();
      return;
    }
    frame = 1;
    win.requestAnimationFrame(sync);
  };
  const afterFocusLeaves = () => win.setTimeout(queue, 60);

  // A finger that would drag the whole page is held, but only while the page can be dragged at all (the keyboard is up: the page is taller than
  // what is seen) and is not zoomed. Sideways moves and two fingers are left alone.
  let lastX = 0;
  let lastY = 0;
  const onTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    lastX = touch.clientX;
    lastY = touch.clientY;
  };
  const onTouchMove = (event) => {
    const touch = event.touches?.[0];
    if (!touch || event.touches.length > 1) return;
    const dx = touch.clientX - lastX;
    const dy = touch.clientY - lastY;
    lastX = touch.clientX;
    lastY = touch.clientY;
    if (!event.cancelable || dy === 0 || Math.abs(dx) > Math.abs(dy)) return;
    if (Math.abs((viewport.scale || 1) - 1) > 0.01) return;
    const page = doc.scrollingElement || root;
    if (page.scrollHeight - viewport.height <= 1) return;
    if (scrollsToward(win, event.target, root, dy)) return;
    event.preventDefault();
  };

  viewport.addEventListener('resize', queue);
  viewport.addEventListener('scroll', queue);
  doc.addEventListener('focusin', queue);
  doc.addEventListener('focusout', afterFocusLeaves);
  doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  doc.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  sync();

  return () => {
    viewport.removeEventListener('resize', queue);
    viewport.removeEventListener('scroll', queue);
    doc.removeEventListener('focusin', queue);
    doc.removeEventListener('focusout', afterFocusLeaves);
    doc.removeEventListener('touchstart', onTouchStart, { capture: true });
    doc.removeEventListener('touchmove', onTouchMove, { capture: true });
    root.style.removeProperty('--vv-bottom');
  };
}
