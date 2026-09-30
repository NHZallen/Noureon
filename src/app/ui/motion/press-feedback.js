// Every pressable thing answers a finger or a click: it sinks under the press and springs back on release, like a
// physical key. One delegated listener covers all of them, including ones added later, so a new button needs no
// styling to feel right.
//
// It finds the pressable by what it looks like to the user (the nearest element under the finger whose cursor is a
// pointer), which is how the page already marks everything clickable, so it needs no list of classes. The motion
// is a Web Animations API animation on `scale`: it does not touch inline styles or the element's own CSS
// transitions, and `scale` is not caught by the global `button { transform: none !important }` rule.

const MAX_LEVELS_UP = 6;
const PRESS_MS = 110;
const RELEASE_MS = 340;
const TOUCH_HOLD_MS = 55; // a touch that turns into a scroll should not flash a press
const MOVE_SLOP = 10;
const RELEASE_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // a little overshoot, like a key coming back up
const PRESS_EASING = 'cubic-bezier(0.2, 0.8, 0.3, 1)';

// How far each size sinks. Small things sink most (they are the easiest to see move); a wide row or a card would
// look like it shrinks away if it sank as much.
export const pressScaleFor = (width, height) => {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  if (longSide <= 56) return 0.88; // icon buttons
  if (shortSide <= 44 && longSide <= 200) return 0.94; // pills, chips, short buttons
  if (shortSide <= 100 && width >= 160) return 0.985; // list rows, menu items
  if (shortSide <= 320) return 0.98; // cards
  return 1; // big surfaces do not sink
};

const SKIP = 'input, textarea, select, [contenteditable="true"], [data-no-press], [disabled], [aria-disabled="true"], .prose a';

// `cursor` is inherited, so the icon inside a button reports a pointer too. The pressable is the outermost element
// of the unbroken run of pointer cursors under the finger: the element that set it.
export function findPressable(start, view) {
  const isPointer = (node) => view.getComputedStyle(node).cursor === 'pointer';
  const stopAt = (node) => !node || node === view.document.body || node === view.document.documentElement;
  let node = start instanceof view.Element ? start : start?.parentElement;
  for (let level = 0; !stopAt(node) && level < MAX_LEVELS_UP; level += 1, node = node.parentElement) {
    if (node.matches?.(SKIP)) return null;
    if (!isPointer(node)) continue;
    let outermost = node;
    while (!stopAt(outermost.parentElement) && !outermost.parentElement.matches(SKIP) && isPointer(outermost.parentElement)) {
      outermost = outermost.parentElement;
    }
    return outermost;
  }
  return null;
}

export function installPressFeedback(doc = document) {
  const view = doc.defaultView;
  if (!view || typeof view.Element?.prototype.animate !== 'function' || doc.documentElement.dataset.pressFeedback) return () => {};
  doc.documentElement.dataset.pressFeedback = 'true';
  const reducedMotion = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const canAnimateScale = typeof view.CSS?.supports === 'function' && view.CSS.supports('scale', '1');
  if (!canAnimateScale) return () => {};

  let press = null;

  // Pressing a control that is switched off (the send button before there is anything to send) gives a small
  // sideways shake: "I felt that, and it cannot do anything right now", instead of silence.
  const nudgeDisabled = (start) => {
    const disabled = start instanceof view.Element ? start.closest('button:disabled, [aria-disabled="true"]') : null;
    if (!disabled || disabled.matches('[data-no-press]')) return;
    const rect = disabled.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    disabled.getAnimations().filter((animation) => animation.id === 'disabled-nudge').forEach((animation) => animation.cancel());
    const nudge = disabled.animate(
      [{ translate: '0' }, { translate: '-3px' }, { translate: '3px' }, { translate: '-2px' }, { translate: '1px' }, { translate: '0' }],
      { duration: 300, easing: 'ease-out' }
    );
    nudge.id = 'disabled-nudge';
  };

  const sink = (state) => {
    if (state.sunk || state.cancelled) return;
    state.sunk = true;
    state.sunkAt = view.performance.now();
    state.animation = state.element.animate(
      [{ scale: '1' }, { scale: String(state.scale) }],
      { duration: PRESS_MS, easing: PRESS_EASING, fill: 'forwards' }
    );
  };

  const rise = (state) => {
    if (!state.sunk) return;
    const current = state.animation;
    const from = view.getComputedStyle(state.element).scale;
    const rising = state.element.animate(
      [{ scale: from === 'none' ? '1' : from }, { scale: '1' }],
      { duration: RELEASE_MS, easing: RELEASE_EASING }
    );
    current?.cancel();
    rising.onfinish = () => rising.cancel();
  };

  const finish = (state, { immediate = false } = {}) => {
    if (state.cancelled || state.done) return;
    state.done = true;
    view.clearTimeout(state.holdTimer);
    if (!state.sunk) {
      if (immediate) { state.cancelled = true; return; }
      // Released before the touch hold elapsed: still show the press, so a quick tap is seen.
      sink(state);
    }
    const shown = view.performance.now() - state.sunkAt;
    const wait = immediate ? 0 : Math.max(0, PRESS_MS - shown);
    view.setTimeout(() => rise(state), wait);
  };

  const onDown = (event) => {
    if (press) finish(press, { immediate: true });
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (reducedMotion?.matches) return;
    const element = findPressable(event.target, view);
    if (!element) {
      nudgeDisabled(event.target);
      return;
    }
    const rect = element.getBoundingClientRect();
    const scale = pressScaleFor(rect.width, rect.height);
    if (scale === 1) return;
    const state = { element, scale, pointerId: event.pointerId, x: event.clientX, y: event.clientY, sunk: false };
    press = state;
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      state.holdTimer = view.setTimeout(() => sink(state), TOUCH_HOLD_MS);
    } else {
      sink(state);
    }
  };

  const onMove = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_SLOP) {
      const state = press;
      press = null;
      finish(state, { immediate: true });
    }
  };

  const onUp = (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const state = press;
    press = null;
    finish(state, { immediate: event.type === 'pointercancel' });
  };

  // Enter and Space press a focused button too.
  const onKeyDown = (event) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
    if (reducedMotion?.matches) return;
    const target = event.target;
    if (!(target instanceof view.Element) || !target.matches('button, [role="button"], summary')) return;
    if (target.matches(SKIP)) return;
    const rect = target.getBoundingClientRect();
    const scale = pressScaleFor(rect.width, rect.height);
    if (scale === 1) return;
    const state = { element: target, scale, sunk: false };
    sink(state);
    state.done = true;
    view.setTimeout(() => rise(state), PRESS_MS);
  };

  doc.addEventListener('pointerdown', onDown, { passive: true });
  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerup', onUp, { passive: true });
  doc.addEventListener('pointercancel', onUp, { passive: true });
  doc.addEventListener('keydown', onKeyDown, { passive: true });

  return () => {
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', onUp);
    doc.removeEventListener('keydown', onKeyDown);
    delete doc.documentElement.dataset.pressFeedback;
  };
}
