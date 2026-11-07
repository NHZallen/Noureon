// A finger on a sheet moves it along one axis at a time (up and down, or left and right), the one the finger goes along first; the other axis stays where it is until the finger is lifted.
// The browser's own touch scrolling goes every way at once, which is hard to use on a wide table. A mouse and the keyboard are left as they are. Page only (it listens to touches).

const START_PX = 6; // how far the finger goes before the axis is chosen
const FRICTION = 0.95; // per frame, after the finger is lifted
const STOP_SPEED = 0.02; // px per ms

/** Gives `grid` (a box that scrolls both ways) the one-axis-at-a-time touch. Returns a function that takes it away. */
export function lockAxisScroll(grid) {
  const view = grid.ownerDocument?.defaultView;
  if (!view || typeof grid.addEventListener !== 'function') return () => {};
  let touch = null;
  let glide = 0;
  const stopGlide = () => { if (glide) { view.cancelAnimationFrame?.(glide); glide = 0; } };
  const room = (axis) => (axis === 'x' ? grid.scrollWidth > grid.clientWidth : grid.scrollHeight > grid.clientHeight);

  const onStart = (event) => {
    stopGlide();
    const point = event.touches?.[0];
    touch = event.touches?.length === 1 && point ? { x: point.clientX, y: point.clientY, axis: '', at: Date.now(), speed: 0, last: { x: point.clientX, y: point.clientY, at: Date.now() } } : null;
  };
  const onMove = (event) => {
    if (!touch || event.touches?.length !== 1) { touch = null; return; }
    const point = event.touches[0];
    if (!touch.axis) {
      const dx = point.clientX - touch.x;
      const dy = point.clientY - touch.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < START_PX) return;
      touch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      // An axis with nothing to move is left to the browser (the window behind may scroll).
      if (!room(touch.axis)) { touch.axis = 'free'; return; }
    }
    if (touch.axis === 'free') return;
    if (event.cancelable) event.preventDefault();
    const now = Date.now();
    const delta = touch.axis === 'x' ? touch.last.x - point.clientX : touch.last.y - point.clientY;
    if (touch.axis === 'x') grid.scrollLeft += delta; else grid.scrollTop += delta;
    const elapsed = Math.max(1, now - touch.last.at);
    touch.speed = delta / elapsed;
    touch.last = { x: point.clientX, y: point.clientY, at: now };
  };
  const onEnd = () => {
    const done = touch;
    touch = null;
    if (!done || (done.axis !== 'x' && done.axis !== 'y') || Math.abs(done.speed) < STOP_SPEED || Date.now() - done.last.at > 80) return;
    let speed = done.speed;
    let before = Date.now();
    const step = () => {
      const now = Date.now();
      const elapsed = now - before;
      before = now;
      const move = speed * elapsed;
      const edge = done.axis === 'x' ? grid.scrollLeft : grid.scrollTop;
      if (done.axis === 'x') grid.scrollLeft += move; else grid.scrollTop += move;
      speed *= FRICTION ** (elapsed / 16);
      const moved = (done.axis === 'x' ? grid.scrollLeft : grid.scrollTop) !== edge;
      glide = moved && Math.abs(speed) > STOP_SPEED ? view.requestAnimationFrame(step) : 0;
    };
    glide = view.requestAnimationFrame(step);
  };

  grid.addEventListener('touchstart', onStart, { passive: true });
  // Not passive: the browser's own scrolling is stopped once the axis is chosen.
  grid.addEventListener('touchmove', onMove, { passive: false });
  grid.addEventListener('touchend', onEnd, { passive: true });
  grid.addEventListener('touchcancel', onEnd, { passive: true });
  return () => {
    stopGlide();
    grid.removeEventListener('touchstart', onStart);
    grid.removeEventListener('touchmove', onMove);
    grid.removeEventListener('touchend', onEnd);
    grid.removeEventListener('touchcancel', onEnd);
  };
}
