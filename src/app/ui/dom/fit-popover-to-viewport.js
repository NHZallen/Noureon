// A popover that opens beside its button (down or up) is shortened to the room there is on the screen, and then it scrolls, so it never runs off the screen
// (the message box grows taller with pictures and files in it, and the menu under it had no room).

const MARGIN = 12;

export function fitPopoverToViewport(popover, window = globalThis.window) {
  if (!popover?.getBoundingClientRect || !window) return;
  popover.style.maxHeight = '';
  const rect = popover.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  if (!viewportHeight || !rect.height) return;
  if (rect.bottom > viewportHeight - MARGIN) {
    // Opens downward: it ends at the bottom of the screen.
    popover.style.maxHeight = `${Math.max(120, Math.floor(viewportHeight - MARGIN - rect.top))}px`;
  } else if (rect.top < MARGIN) {
    // Opens upward: it ends under the top of the screen.
    popover.style.maxHeight = `${Math.max(120, Math.floor(rect.height - (MARGIN - rect.top)))}px`;
  }
}
