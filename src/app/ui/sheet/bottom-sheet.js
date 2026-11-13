// The one engine behind every sheet that rises from the bottom on a phone (the "+" sheet, the sources, the "add" choices of a project):
// a card that floats above the page with a gap at both sides and at the bottom, and that is pulled by the finger between its medium
// height and its large height (the gaps close as it grows), or down to close it. The numbers and the arithmetic are in sheet-physics.js;
// what a caller brings is what goes inside: the parts of the card, which of them is the handle and which the scrolling body.
//
//   const sheet = createBottomSheet({ document, parts: [grip, head, body], handles: [grip, head], body, label, onClose });
//   sheet.snap('large')  /  sheet.refit()  /  sheet.close()
//
// Medium height: as tall as what it holds, up to a share of the screen (MEDIUM_FRACTION). At that height the body does not scroll: a
// pull on it moves the card (up makes it larger, as iOS sheets do); at the large height the body scrolls and the handle moves the card.
// A sheet that cannot grow (`expandable: false`) scrolls its body at every height and only closes.

import { MEDIUM_FRACTION, decideRelease, geometry, resist, springStep, velocityOf } from './sheet-physics.js';

const NO_DRAG = 'input, textarea, select, [data-no-drag]';
const THRESHOLD = 6;
let current = null;

export const closeBottomSheet = () => current?.close();
// A sheet that is asked for while another is open takes its place at once (no slide out for the one that goes).
const replaceCurrent = () => current?.dispose();

export function createBottomSheet({ document, parts, handles = [], body, label = '', expandable = true, closable = true, cap = MEDIUM_FRACTION, initial = 'medium', zIndex = 0, onClose = () => {} }) {
  replaceCurrent();
  const win = document.defaultView;
  const reduced = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const root = document.createElement('div');
  root.className = 'bs-root';
  if (zIndex) root.style.zIndex = String(zIndex);
  const backdrop = document.createElement('div');
  backdrop.className = 'bs-backdrop';
  const card = document.createElement('div');
  card.className = 'bs-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  if (label) card.setAttribute('aria-label', label);
  card.tabIndex = -1;
  card.append(...parts);
  // The body scrolls with the finger at every height (the card takes the touch over where a list would stop: see the pull below).
  body.style.overflowY = 'auto';
  body.style.touchAction = 'pan-y';
  body.style.overscrollBehavior = 'contain';
  root.append(backdrop, card);
  document.body.append(root);
  document.documentElement.classList.add('source-sheet-open');

  const opener = document.activeElement;
  let state = initial;
  let top = 0;
  let stops = { medium: 0, large: 0, height: 0, screen: 0, sideGap: 8, bottomGap: 8 };
  let frame = 0;
  let closed = false;
  let drag = null;
  let suppressClick = false;

  // The gap under the card follows the home bar of the phone (the reference keeps the card above it); the top follows the status bar.
  const probe = (property, css) => {
    const node = document.createElement('div');
    node.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;${property}:${css}`;
    root.append(node);
    const value = parseFloat(win.getComputedStyle(node)[property]) || 0;
    node.remove();
    return value;
  };

  // How tall the card would be if it were as tall as its content: measured with the body let go of its box.
  const naturalHeight = () => {
    const saved = [card.style.top, body.style.flex, body.style.overflowY, card.style.transform];
    card.style.top = 'auto';
    card.style.transform = '';
    body.style.flex = 'none';
    body.style.overflowY = 'visible';
    const height = card.offsetHeight;
    [card.style.top, body.style.flex, body.style.overflowY, card.style.transform] = saved;
    return height;
  };

  const measure = () => {
    const screen = root.clientHeight || win.innerHeight;
    const bottomGap = Math.max(8, probe('paddingBottom', 'calc(env(safe-area-inset-bottom, 0px) - 12px)'));
    const largeTop = Math.max(probe('paddingTop', 'env(safe-area-inset-top, 0px)'), 16) - 1;
    const height = Math.min(naturalHeight(), Math.round(screen * cap));
    stops = { screen, height, bottomGap, sideGap: 8, large: largeTop, medium: Math.max(largeTop, screen - bottomGap - height) };
  };

  const paint = (value) => {
    top = value;
    const g = geometry({ top, medium: stops.medium, large: stops.large, sideGap: stops.sideGap, bottomGap: stops.bottomGap });
    const s = card.style;
    s.top = `${g.top}px`;
    s.left = `${g.side}px`;
    s.right = `${g.side}px`;
    s.bottom = `${g.bottom}px`;
    s.borderBottomLeftRadius = s.borderBottomRightRadius = `${g.bottomRadius}px`;
    s.transform = g.shift ? `translate3d(0, ${g.shift}px, 0)` : '';
    backdrop.style.opacity = String(Math.max(0, 1 - g.shift / Math.max(1, stops.height)));
  };

  const stopFrame = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  };

  // Moves the card to a stop with the spring (it jumps there with reduced motion).
  const settle = (target, velocity = 0, done = () => {}) => {
    stopFrame();
    const to = target === 'large' ? stops.large : target === 'medium' ? stops.medium : stops.screen + 12;
    if (reduced()) { paint(to); done(); return; }
    let motion = { x: top, v: velocity };
    const began = win.performance.now();
    let last = began;
    const tick = (now) => {
      // Gone from the page (or taking longer than a spring can): it ends where it was going.
      if (!root.isConnected || now - began > 3000) { paint(to); frame = 0; done(); return; }
      let remaining = Math.min(0.05, (now - last) / 1000);
      last = now;
      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 240);
        motion = springStep(motion, to, dt);
        remaining -= dt;
      }
      // Never above the top it is going to (a pull up stops there), nor past the screen's edge when it leaves.
      if (target === 'large' && motion.x < stops.large) motion = { x: stops.large, v: 0 };
      paint(motion.x);
      if (Math.abs(motion.x - to) < 0.5 && Math.abs(motion.v) < 12) { paint(to); frame = 0; done(); return; }
      frame = win.requestAnimationFrame(tick);
    };
    frame = win.requestAnimationFrame(tick);
  };

  const setState = (next) => {
    state = next;
    card.dataset.state = state;
  };

  const close = (velocity = 0) => {
    if (closed) return;
    closed = true;
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('resize', onResize);
    document.documentElement.classList.remove('source-sheet-open');
    card.classList.add('is-closing');
    if (current === api) current = null;
    const finish = () => { stopFrame(); root.remove(); };
    settle('close', velocity, finish);
    try { opener?.focus?.({ preventScroll: true }); } catch { /* the opener is gone */ }
    onClose();
  };

  const dispose = () => {
    if (closed) return;
    close();
    stopFrame();
    root.remove();
  };

  const snap = (target, velocity = 0) => {
    if (closed || (target === 'large' && !expandable)) return;
    setState(target);
    settle(target, velocity);
  };

  // The content changed (another page, more rows): the medium height is worked out again and the card goes to its stop.
  const refit = (target = state) => {
    if (closed) return;
    measure();
    setState(target);
    settle(target);
  };

  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (closable) close();
  };
  const onResize = () => { if (!drag) { measure(); paint(state === 'large' ? stops.large : stops.medium); } };
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('resize', onResize);
  backdrop.addEventListener('click', () => { if (closable) close(); });

  // The pull. A handle moves the card at any height (it starts at once, after a few pixels). The body scrolls with the finger as any list does
  // and hands the touch to the card where a list would stop: a pull down while it is at its top moves the card down (and closes it), a pull
  // up while the card is not large makes it larger first. (A mouse pulls the body of a card that is not large, as a handle.)
  const startDrag = (y, stamp) => {
    stopFrame();
    drag = { y, start: top, samples: [{ t: stamp, y }], live: false };
  };
  const moveDrag = (y, stamp) => {
    drag.samples.push({ t: stamp, y });
    if (drag.samples.length > 12) drag.samples.shift();
    let value = drag.start + (y - drag.y);
    if (!expandable) value = Math.max(value, stops.medium);
    paint(resist(value, stops.large));
  };
  const endDrag = (cancelled) => {
    const moved = drag.live;
    const velocity = moved && !cancelled ? velocityOf(drag.samples) : 0;
    drag = null;
    card.classList.remove('is-dragging');
    if (!moved) return;
    // The click that ends this touch is not a press on what is under the finger.
    suppressClick = true;
    win.setTimeout(() => { suppressClick = false; }, 0);
    const outcome = decideRelease({ top, velocity, medium: stops.medium, large: stops.large, mediumHeight: stops.height, expandable, closable });
    if (outcome === 'close') close(velocity);
    else snap(outcome, velocity);
  };
  const onHandle = (target) => handles.some((handle) => handle.contains(target));
  card.addEventListener('pointerdown', (event) => {
    if (event.button > 0 || event.target.closest?.(NO_DRAG)) return;
    const mouseOnBody = event.pointerType === 'mouse' && expandable && state !== 'large' && body.contains(event.target);
    if (onHandle(event.target) || mouseOnBody) { drag = null; startDrag(event.clientY, event.timeStamp); drag.id = event.pointerId; }
  });
  card.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.live) {
      const dy = event.clientY - drag.y;
      if (Math.abs(dy) < THRESHOLD && Math.abs(event.clientX - (drag.x ?? event.clientX)) < THRESHOLD) return;
      drag.live = true;
      try { card.setPointerCapture?.(event.pointerId); } catch { /* no capture */ }
      card.classList.add('is-dragging');
    }
    moveDrag(event.clientY, event.timeStamp);
  });
  const release = (event) => {
    if (drag && drag.id === event.pointerId) endDrag(event.type === 'pointercancel');
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);

  // A touch on the body: decided at the first few pixels, then it is the list's (scrolls) or the card's (follows the finger).
  let touch = null;
  body.addEventListener('touchstart', (event) => {
    touch = event.touches.length === 1 && !event.target.closest?.(NO_DRAG) ? { x: event.touches[0].clientX, y: event.touches[0].clientY, native: false } : null;
  }, { passive: true });
  body.addEventListener('touchmove', (event) => {
    if (!touch || touch.native) return;
    const point = event.touches[0];
    if (!drag) {
      const dy = point.clientY - touch.y;
      if (Math.abs(dy) < THRESHOLD && Math.abs(point.clientX - touch.x) < THRESHOLD) return;
      const hand = Math.abs(point.clientX - touch.x) <= Math.abs(dy) && event.cancelable
        && (dy > 0 ? body.scrollTop <= 0 : expandable && state !== 'large');
      if (!hand) { touch.native = true; return; }
      startDrag(point.clientY, event.timeStamp);
      drag.live = true;
      drag.touch = true;
      card.classList.add('is-dragging');
    }
    event.preventDefault();
    moveDrag(point.clientY, event.timeStamp);
  }, { passive: false });
  const touchEnd = (event) => {
    if (drag?.touch) endDrag(event.type === 'touchcancel');
    touch = null;
  };
  body.addEventListener('touchend', touchEnd);
  body.addEventListener('touchcancel', touchEnd);
  card.addEventListener('click', (event) => { if (suppressClick) { event.stopPropagation(); event.preventDefault(); } }, true);

  const api = { close, dispose, snap, refit, element: root, card, state: () => state };
  current = api;
  measure();
  setState(initial);
  paint(stops.screen + 12);
  win.requestAnimationFrame(() => {
    if (closed) return;
    settle(initial);
    card.focus?.({ preventScroll: true });
  });
  return api;
}
