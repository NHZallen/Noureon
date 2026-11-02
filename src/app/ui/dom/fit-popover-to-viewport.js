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

/**
 * The popover is fitted again while it is open: the keyboard of a phone is still sliding when a menu is opened right after the box was tapped, and the box (and the menu with it) moves
 * as the screen is resized, so a measure taken at the tap is stale. Returns a function that stops it (also stopped by itself when the menu is closed).
 */
export function fitPopoverWhileOpen(popover, window = globalThis.window) {
  if (!popover?.getBoundingClientRect || !window) return () => {};
  const targets = [window, window.visualViewport].filter((target) => target?.addEventListener);
  const timers = [];
  let stopped = false;
  const refit = () => {
    if (stopped) return;
    if (!popover.classList?.contains('visible')) { stop(); return; }
    fitPopoverToViewport(popover, window);
  };
  function stop() {
    if (stopped) return;
    stopped = true;
    targets.forEach((target) => target.removeEventListener('resize', refit));
    timers.forEach((timer) => window.clearTimeout?.(timer));
  }
  targets.forEach((target) => target.addEventListener('resize', refit));
  if (typeof window.setTimeout === 'function') {
    [120, 300, 600].forEach((delay) => timers.push(window.setTimeout(refit, delay)));
    timers.push(window.setTimeout(stop, 2000));
  }
  return stop;
}
