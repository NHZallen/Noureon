// On a phone the page does not shrink when the keyboard comes up: the phone slides what is seen (the visual viewport) up over a page that keeps
// its full height, so the app, fixed to the whole page, had its top cut off, its box moved, and could be dragged about under the finger.
// This hands the app the geometry of what is seen (--vv-top, --vv-height on <html>), and styles/layout.css lays the app over exactly that.
// Chrome on iPhone also puts its own bar (the cog, the arrows and the tick) over the foot of the page while a box is being typed in, and the
// page is not told of it, so that much is kept free at the foot while the keyboard is up.

const KEYBOARD_MIN_HEIGHT = 100; // what the visible height must lose before it is taken for a keyboard
const CHROME_IOS_ACCESSORY_BAR = 48;

const isTypingTarget = (element) => Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));

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
      root.style.removeProperty('--vv-top');
      root.style.removeProperty('--vv-height');
      return;
    }
    const keyboardUp = isTypingTarget(doc.activeElement) && (win.innerHeight || 0) - viewport.height > KEYBOARD_MIN_HEIGHT;
    const reserved = keyboardUp && chromeOnIphone ? CHROME_IOS_ACCESSORY_BAR : 0;
    root.style.setProperty('--vv-top', `${Math.round(viewport.offsetTop || 0)}px`);
    root.style.setProperty('--vv-height', `${Math.max(0, Math.round(viewport.height - reserved))}px`);
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

  viewport.addEventListener('resize', queue);
  viewport.addEventListener('scroll', queue);
  doc.addEventListener('focusin', queue);
  doc.addEventListener('focusout', afterFocusLeaves);
  sync();

  return () => {
    viewport.removeEventListener('resize', queue);
    viewport.removeEventListener('scroll', queue);
    doc.removeEventListener('focusin', queue);
    doc.removeEventListener('focusout', afterFocusLeaves);
    root.style.removeProperty('--vv-top');
    root.style.removeProperty('--vv-height');
  };
}
