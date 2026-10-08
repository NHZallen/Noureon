// On a phone the page does not shrink when the keyboard comes up: the phone slides what is seen (the visual viewport) up over a page that keeps
// its full height, so the app, fixed to the whole page, had its box covered by the keyboard and its top slid out of sight. This hands the app
// where the seen area ends (--vv-bottom on <html>: the top of the keyboard, which does not change as the phone slides the page), and
// styles/layout.css makes the app end there, from the top of the page. The box is NOT moved with the seen area: a box that follows it makes the
// phone slide again to show the caret, and the two chase each other (the box shook).
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
    root.style.removeProperty('--vv-bottom');
  };
}
