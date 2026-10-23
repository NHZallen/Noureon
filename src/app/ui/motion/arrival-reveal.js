// A reply that arrives whole (the result of a visual check, the files a reply made) is drawn in, not set down at once: the class starts a
// short reveal (styles/chat-streaming.css) and is taken off again when it is over, so a redraw of the chat later does not play it again.

const REVEAL_MS = 1200;

/** Starts the reveal named by `className` on `element` for a moment. Nothing when there is no element. */
export function revealArrival(element, className, { ms = REVEAL_MS, schedule = (callback, delay) => setTimeout(callback, delay) } = {}) {
  if (!element?.classList) return false;
  element.classList.add(className);
  schedule(() => element.classList.remove(className), ms);
  return true;
}
