// Keeps the page from being pinched or double-tapped into a zoom, without a listener that can hold a swipe up.
//
// A touchstart or touchend listener that may call preventDefault makes the browser wait for the page's main thread
// before it starts scrolling anything: while the page is busy (a long reply streaming, a presentation being drawn and
// checked) every swipe stalled and the chat looked frozen. Zooming is stopped without one: Safari's gesture events
// are cancelled for the pinch, and `touch-action: manipulation` (base.css) turns off the double-tap zoom.
export function installTouchGuards() {
  const stop = (event) => event.preventDefault();
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  document.addEventListener('gestureend', stop);
}
