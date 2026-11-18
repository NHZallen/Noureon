// The trackpad of the phone when the person has taken over (design section 16): the blank area under the screen becomes a trackpad. One finger sliding moves the
// circle (as a mouse is moved: by how far the finger goes, not to where it is), a short tap clicks where the circle is, a finger held still and then moved drags,
// two fingers sliding scroll. This is the logic only: it is told what the fingers do (down, move, up, with the time) and tells what to do with the browser.
//   onMove(dx, dy)      the circle goes by this much (in the unit of the pad: its width);
//   onClick()           a tap;
//   onDragStart() / onDragEnd()   the finger held and moved / let go;
//   onScroll(dx, dy)    two fingers (the same unit);
// Nothing here touches the page.

export const TAP_MS = 250; // a touch shorter than this, without moving, is a tap
export const TAP_SLOP = 8; // px a finger may move and still be a tap
export const HOLD_MS = 450; // a finger held still this long takes hold (a drag begins at the next move)

export function createTrackpad({ onMove = () => {}, onClick = () => {}, onDragStart = () => {}, onDragEnd = () => {}, onScroll = () => {}, width = () => 1 } = {}) {
  const fingers = new Map(); // id -> { x, y, startX, startY, startAt, moved }
  let dragging = false;
  let maxFingers = 0;

  const unit = (px) => px / Math.max(1, width());
  const centre = () => {
    const all = [...fingers.values()];
    return { x: all.reduce((sum, f) => sum + f.x, 0) / all.length, y: all.reduce((sum, f) => sum + f.y, 0) / all.length };
  };

  return {
    get dragging() { return dragging; },
    down(id, x, y, at) {
      fingers.set(id, { x, y, startX: x, startY: y, startAt: at, moved: false });
      maxFingers = Math.max(maxFingers, fingers.size);
    },
    move(id, x, y, at) {
      const finger = fingers.get(id);
      if (!finger) return;
      const before = fingers.size > 1 ? centre() : { x: finger.x, y: finger.y };
      finger.x = x;
      finger.y = y;
      if (!finger.moved && Math.hypot(x - finger.startX, y - finger.startY) > TAP_SLOP) {
        finger.moved = true;
        // Held still until now, and only now moving: the finger takes hold. Decided at this moment only: a finger that slid from the start and has been down for a long time is a slide, not a drag
        // (it was a drag, with the button down in the page, and the page selected text all over).
        finger.heldBeforeMove = at - finger.startAt >= HOLD_MS;
      }
      if (fingers.size > 1) {
        // Two fingers: the middle of them is what scrolls.
        const now = centre();
        onScroll(unit(now.x - before.x), unit(now.y - before.y));
        return;
      }
      if (!finger.moved) return;
      // A finger that was held still before it moved takes the thing under the circle with it.
      if (!dragging && finger.heldBeforeMove && !finger.dragStarted) {
        finger.dragStarted = true;
        dragging = true;
        onDragStart();
      }
      onMove(unit(x - before.x), unit(y - before.y));
    },
    up(id, at) {
      const finger = fingers.get(id);
      if (!finger) return;
      fingers.delete(id);
      if (dragging && fingers.size === 0) {
        dragging = false;
        onDragEnd();
      } else if (fingers.size === 0 && maxFingers === 1 && !finger.moved && at - finger.startAt < TAP_MS) {
        onClick();
      }
      if (fingers.size === 0) maxFingers = 0;
    },
    cancel() {
      if (dragging) onDragEnd();
      dragging = false;
      fingers.clear();
      maxFingers = 0;
    }
  };
}
