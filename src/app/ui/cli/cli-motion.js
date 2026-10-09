// The motion of the Extensions page (opening and closing, a row opening, the list changing, the menu of a row). The page draws its list again at every change, so the
// motion is made after the drawing from where each row was: a row that stays slides from its old place, a row that opens grows from its old height, a new row fades in.
// All of it uses the browser's own `animate`; without it (the tests) or when the person asked for less motion, nothing moves and nothing is waited for.

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.5, 0, 0.75, 0)';
// What a row that is open adds to it; they fade in as the row grows.
const OPENED_PARTS = '.cs-about, .cs-examples, .cs-skill-text, .cs-details, .cs-skill-files';

export const canAnimate = (element) => {
  if (typeof element?.animate !== 'function') return false;
  try {
    return !element.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return true;
  }
};

const play = (element, keyframes, options = {}) => {
  try {
    return element.animate(keyframes, { easing: EASE_OUT, ...options });
  } catch {
    return null;
  }
};

// Runs `done` when the animation ends, however it ends (or at once when there is none).
const afterwards = (animation, done) => {
  if (!animation) {
    done();
    return;
  }
  animation.onfinish = done;
  animation.oncancel = done;
};

/** The page arrives: it rises a little as it fades in. */
export const enterPage = (root) => {
  if (!canAnimate(root)) return;
  play(root, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 280 });
};

/** The page leaves the same way; `done` takes it out of the document (at once when nothing moves). */
export const leavePage = (root, done) => {
  if (!canAnimate(root)) {
    done();
    return;
  }
  root.style.pointerEvents = 'none';
  afterwards(play(root, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(14px)' }], { duration: 180, easing: EASE_IN, fill: 'forwards' }), done);
};

/** The menu of a row arrives: a sheet slides up from the bottom of the screen, a menu next to its button grows from it. */
export const enterMenu = (menu, backdrop) => {
  if (!canAnimate(menu)) return;
  if (menu.classList.contains('is-sheet')) play(menu, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 320 });
  else play(menu, [{ opacity: 0, transform: 'translateY(-6px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 160 });
  if (backdrop) play(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
};

/** The menu and its backdrop leave, and are taken out when they are gone (at once when nothing moves). */
export const leaveMenu = (menu, backdrop) => {
  for (const element of [menu, backdrop]) {
    if (!element) continue;
    element.classList.add('is-leaving');
    if (!canAnimate(element)) {
      element.remove();
      continue;
    }
    element.style.pointerEvents = 'none';
    let frames;
    let options;
    if (element === backdrop) {
      frames = [{ opacity: 1 }, { opacity: 0 }];
      options = { duration: 200, easing: 'ease-in' };
    } else if (element.classList.contains('is-sheet')) {
      frames = [{ transform: 'none' }, { transform: 'translateY(100%)' }];
      options = { duration: 240, easing: EASE_IN };
    } else {
      frames = [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px) scale(0.97)' }];
      options = { duration: 110, easing: 'ease-in' };
    }
    afterwards(play(element, frames, { ...options, fill: 'forwards' }), () => element.remove());
  }
};

const keyOf = (row) => {
  if (row.dataset.cliId) return `c:${row.dataset.cliId}`;
  if (row.dataset.skillName) return `s:${row.dataset.skillName}`;
  return null;
};

/** Where each row of the list is (and how tall), before it is drawn again. */
export const measureRows = (list) => {
  const rows = new Map();
  for (const row of list.querySelectorAll('.cs-row')) {
    const key = keyOf(row);
    if (!key) continue;
    const box = row.getBoundingClientRect();
    rows.set(key, { top: box.top, height: box.height });
  }
  return rows;
};

/**
 * After the list was drawn again: `before` is what measureRows saw. A row that opened or closed (`open` is its key) grows or shrinks from its old height, and the rows
 * below follow it; otherwise a row that moved slides from its old place, and a row that was not there fades in, one after the other. The first drawing (nothing
 * before) does not move: the page arrives as a whole.
 */
export const playRows = (list, before, { open = null } = {}) => {
  if (!before.size || !canAnimate(list)) return;
  let entering = 0;
  for (const row of list.querySelectorAll('.cs-row')) {
    const key = keyOf(row);
    const previous = key ? before.get(key) : null;
    if (!previous) {
      play(row, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: Math.min(entering, 6) * 32, fill: 'backwards' });
      entering += 1;
      continue;
    }
    const now = row.getBoundingClientRect();
    if (open) {
      if (key !== open || Math.abs(now.height - previous.height) < 1) continue;
      row.style.overflow = 'hidden';
      // A tall change takes a little longer than a short one, so that it does not look like a jump.
      const duration = Math.round(Math.min(460, Math.max(260, 220 + Math.abs(now.height - previous.height) * 0.3)));
      afterwards(play(row, [{ height: `${previous.height}px` }, { height: `${now.height}px` }], { duration }), () => { row.style.overflow = ''; });
      for (const part of row.querySelectorAll(OPENED_PARTS)) play(part, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 80, fill: 'backwards' });
      continue;
    }
    const shift = previous.top - now.top;
    if (Math.abs(shift) >= 1) play(row, [{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: 320 });
  }
};
