// The messages the person added while a reply was made (features/reply-steering.js), drawn as the bubbles of ordinary messages of theirs, above the reply they went into.
// Live: one bubble when the message is put into the reply (a little faded until the model has seen it). Saved: from the reply's run record (`steers`), by the message renderer.

const BUBBLE_CLASS = 'message-item flex items-start gap-2 md:gap-4 justify-end user-message steer-message';
const STACK_CLASS = 'message-stack message-stack-user';
const BODY_CLASS = 'p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative';
const CONTENT_CLASS = 'prose prose-sm max-w-none text-[var(--text-primary)] message-content';

const escapeHTML = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

/** The markup of the bubbles of a saved reply (its run record's `steers`), as a string for the message renderer. */
export const steerBubblesHTML = (steers) => (Array.isArray(steers) ? steers : [])
  .filter((steer) => steer?.text)
  .map((steer) => `<div class="${BUBBLE_CLASS}"><div class="${STACK_CLASS}"><div class="${BODY_CLASS}"><div class="${CONTENT_CLASS}"><div>${escapeHTML(steer.text)}</div></div></div></div></div>`)
  .join('');

/**
 * The bubbles of a reply that is being made. `place()` is the message the reply is in (its stack); they go in front of its first bubble, in the order they came.
 * `add({ text, pending })` draws one; `seen(text)` takes the faded look off the oldest bubble that still has it (false when there is none).
 */
export function createSteerBubbles({ document, place }) {
  const bubbles = [];
  const add = ({ text, pending = false }) => {
    const stack = place();
    if (!stack) return null;
    const holder = document.createElement('div');
    holder.innerHTML = steerBubblesHTML([{ text }]);
    const element = holder.firstElementChild;
    if (!element) return null;
    if (pending) element.classList.add('is-pending');
    // After the bubbles already there, in front of the reply's own.
    const last = bubbles.at(-1)?.element;
    if (last?.parentElement === stack) last.after(element);
    else stack.insertBefore(element, stack.querySelector('.message-bubble'));
    bubbles.push({ text, element, pending });
    return element;
  };
  return {
    add,
    seen(text) {
      const entry = bubbles.find((item) => item.pending && item.text === text);
      if (!entry) return false;
      entry.pending = false;
      entry.element.classList.remove('is-pending');
      return true;
    },
    remove: () => bubbles.splice(0).forEach((item) => item.element.remove())
  };
}
