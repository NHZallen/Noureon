// The browser card and its pill turn into each other as one thing (design: docs/superpowers/specs/2026-11-16-browser-agent-design.md, section 16).
// Opening: the pill grows into the card: the card is shown through a window of the pill's shape that opens to the whole card, the pill's own words fade away on the way, and the
// conversation below makes room as the height grows. Folding is the same in reverse. It is made with Web Animations on the clip of the card and the height of the whole (nothing
// is scaled, so no text is stretched). One curve for all of it: fast at first and settling softly, the way a drawer comes.

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION = 380;

let running = null;

const reduced = (view) => Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

/** The sizes before the change, which the animation starts from. */
export function measureCard({ root, card, pill }) {
  const rootBox = root.getBoundingClientRect();
  const cardBox = card.hidden ? null : card.getBoundingClientRect();
  const pillBox = pill.hidden ? null : pill.getBoundingClientRect();
  return { rootHeight: rootBox.height, card: cardBox && { width: cardBox.width, height: cardBox.height }, pill: pillBox && { width: pillBox.width, height: pillBox.height } };
}

const clear = (...elements) => elements.forEach((element) => { element.removeAttribute('style'); });

/**
 * Plays the change that has already been made to the page (`before` was measured first). 'open': the pill went, the card came. 'fold': the card went, the pill came.
 * Resolves when it is over (also when it was cut short by another one).
 */
export function playMorph({ direction, before, root, card, pill }) {
  const view = root.ownerDocument?.defaultView;
  if (!before || typeof card.animate !== 'function' || reduced(view)) return Promise.resolve();
  running?.stop();
  const after = measureCard({ root, card, pill });
  const open = direction === 'open';
  const pillSize = open ? before.pill : after.pill;
  const cardSize = open ? after.card : before.card;
  if (!pillSize || !cardSize) return Promise.resolve();
  const radius = Math.round(parseFloat(view.getComputedStyle(card).borderTopLeftRadius) || 18);
  const full = `inset(0px 0px 0px 0px round ${radius}px)`;
  const small = `inset(0px ${Math.max(0, cardSize.width - pillSize.width)}px ${Math.max(0, cardSize.height - pillSize.height)}px 0px round ${pillSize.height / 2}px)`;
  const animations = [];
  const startHeight = open ? before.rootHeight : before.rootHeight;
  const endHeight = after.rootHeight;

  root.style.overflow = 'hidden';
  root.style.position = 'relative';
  // The one that goes is kept on the page for the length of the change, laid over the one that comes (it is not touched by the pointer).
  const leaving = open ? pill : card;
  leaving.hidden = false;
  leaving.style.position = 'absolute';
  leaving.style.top = '0px';
  leaving.style.left = '0px';
  leaving.style.pointerEvents = 'none';
  if (!open) { leaving.style.width = `${cardSize.width}px`; leaving.style.height = `${cardSize.height}px`; leaving.style.zIndex = '2'; }
  else leaving.style.zIndex = '2';

  const options = { duration: DURATION, easing: EASE, fill: 'both' };
  animations.push(root.animate([{ height: `${startHeight}px` }, { height: `${endHeight}px` }], options));
  if (open) {
    animations.push(card.animate([{ clipPath: small }, { clipPath: full }], options));
    animations.push(pill.animate([{ opacity: 1 }, { opacity: 0, offset: 0.45 }, { opacity: 0 }], { ...options, easing: 'linear' }));
  } else {
    animations.push(card.animate([{ clipPath: full, opacity: 1 }, { clipPath: small, opacity: 1, offset: 0.8 }, { clipPath: small, opacity: 0 }], options));
    animations.push(pill.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { ...options, easing: 'linear' }));
  }

  const finish = () => {
    animations.forEach((animation) => { try { animation.cancel(); } catch { /* already over */ } });
    clear(pill, root);
    if (open) clear(card);
    else { clear(card); card.hidden = true; }
    if (open) pill.hidden = true;
    if (running?.stop === stop) running = null;
  };
  const stop = () => finish();
  const done = Promise.all(animations.map((animation) => animation.finished.catch(() => null))).then(finish);
  running = { stop };
  return done;
}
