// A drawer that is pushed away with a finger (docs/superpowers/specs/2026-11-11-interaction-overhaul-design.md §5, phase 4): the panel follows the finger one to one, it goes
// away when it was pushed far enough or flicked fast enough (a quick flick is enough, whatever the distance), it is held back with growing friction when pushed the wrong
// way, and it returns when let go too early. A second finger is ignored once the first has begun. The motion that finishes is the panel's own transition (its class or its
// inline transform), started from where the finger left it.
//
// Touch events are used because a page that listens to them passively never holds a scroll up; `touch-action: pan-y` on the panel (styles/layout.css `[data-drag-dismiss]`)
// keeps the vertical scroll with the browser and leaves the sideways move to this.
//
// `direction`: 1 when the panel leaves to the right, -1 to the left. Page only.

const SLOP = 10; // pixels before the move is taken for a drag
const AXIS_RATIO = 1.5; // sideways must win by this much over vertical
const DISTANCE_SHARE = 0.35; // of the panel's width
const FLICK = 0.11; // pixels per millisecond
const MIN_FLICK_DISTANCE = 12;
const LEGACY_DISTANCE = 50; // a touch that ended without a move event (a swipe made by a script) counts when it went this far

// How far the panel is shown moved for a finger that moved `distance` toward the way out (negative: the wrong way, held back).
export const dragOffset = (distance) => (distance >= 0 ? distance : -Math.sqrt(-distance) * 2.2);

// Whether a release closes the panel.
export const shouldDismiss = ({ distance, velocity, width }) =>
  distance > 0 && (distance >= width * DISTANCE_SHARE || (velocity > FLICK && distance > MIN_FLICK_DISTANCE));

/**
 * options: direction, onDismiss(), enabled() (default true), ignore(target) (a swipe that starts on something that slides sideways itself is that thing's), moveTarget (the element that
 * moves; default the one listened to), onDragStart(). Returns { detach() }.
 */
export function attachDragDismiss(listenTo, { direction = 1, onDismiss, enabled = () => true, ignore = () => false, moveTarget = listenTo, onDragStart = () => {} }) {
  let touch = null;

  const reset = () => { touch = null; };
  const restore = (state) => {
    moveTarget.style.transition = state.transition;
    moveTarget.style.transform = state.transform;
  };

  const onStart = (event) => {
    if (touch?.dragging) return; // a second finger does not take the panel over
    if (event.touches.length !== 1 || !enabled() || ignore(event.target)) { reset(); return; }
    const point = event.touches[0];
    touch = { x: point.clientX, y: point.clientY, lastX: point.clientX, lastTime: event.timeStamp, velocity: 0, dragging: false, transition: moveTarget.style.transition, transform: moveTarget.style.transform, width: moveTarget.offsetWidth || 1 };
  };

  const onMove = (event) => {
    if (!touch) return;
    if (event.touches.length !== 1) { if (touch.dragging) finish(false); else reset(); return; }
    const point = event.touches[0];
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    if (!touch.dragging) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) { reset(); return; }
      if (Math.abs(dx) <= SLOP || Math.abs(dx) < Math.abs(dy) * AXIS_RATIO || Math.sign(dx) !== direction) return;
      touch.dragging = true;
      moveTarget.style.transition = 'none';
      onDragStart();
    }
    const distance = dx * direction;
    const elapsed = event.timeStamp - touch.lastTime;
    if (elapsed > 0) touch.velocity = ((point.clientX - touch.lastX) * direction) / elapsed;
    touch.lastX = point.clientX;
    touch.lastTime = event.timeStamp;
    touch.distance = distance;
    moveTarget.style.transform = `translate3d(${dragOffset(distance) * direction}px, 0, 0)`;
  };

  function finish(allowDismiss, event) {
    const state = touch;
    touch = null;
    if (!state) return;
    if (!state.dragging) {
      // No move was seen: a touch that went far enough sideways, from the start to the end, closes the panel as the old swipe did.
      const point = event?.changedTouches?.[0];
      if (allowDismiss && point) {
        const dx = (point.clientX - state.x) * direction;
        const dy = point.clientY - state.y;
        if (dx > LEGACY_DISTANCE && Math.abs(dy) < dx / 2) onDismiss();
      }
      return;
    }
    const dismiss = allowDismiss && shouldDismiss({ distance: state.distance || 0, velocity: state.velocity, width: state.width });
    // The panel's own transition takes it from where the finger left it: the inline values go back to what they were, and the state changes in the same frame.
    restore(state);
    if (dismiss) onDismiss();
  }

  const onEnd = (event) => finish(true, event);
  const onCancel = () => finish(false);

  listenTo.addEventListener('touchstart', onStart, { passive: true });
  listenTo.addEventListener('touchmove', onMove, { passive: true });
  listenTo.addEventListener('touchend', onEnd, { passive: true });
  listenTo.addEventListener('touchcancel', onCancel, { passive: true });
  return {
    detach() {
      listenTo.removeEventListener('touchstart', onStart);
      listenTo.removeEventListener('touchmove', onMove);
      listenTo.removeEventListener('touchend', onEnd);
      listenTo.removeEventListener('touchcancel', onCancel);
    }
  };
}
