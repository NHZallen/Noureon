// A message the person added while a reply is made and the reply has not yet taken (features/reply-steering.js): a bubble like the person's own, a little faded, under the reply
// it was put into. When the reply takes it, the server cuts the reply there and the message becomes a message of the conversation (reply/reply-cut.js), and the bubble goes.

const escapeHTML = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const bubbleHTML = (text) => `<div class="message-stack message-stack-user"><div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative"><div class="prose prose-sm max-w-none text-[var(--text-primary)] message-content"><div>${escapeHTML(text)}</div></div></div></div>`;

/** `place()`: the element the first bubble goes after (the message the reply is written in); it can be changed with `setPlace`. */
export function createPendingSteers({ document, place = () => null }) {
  const pending = [];
  let where = place;
  return {
    setPlace(next) {
      where = typeof next === 'function' ? next : () => null;
    },
    add({ id, text }) {
      const anchor = pending.at(-1)?.element || where();
      if (!anchor?.parentElement) return false;
      const element = document.createElement('div');
      element.className = 'message-item flex items-start gap-2 md:gap-4 justify-end user-message steer-message is-pending';
      element.dataset.steerId = id;
      element.innerHTML = bubbleHTML(text);
      anchor.after(element);
      pending.push({ id, text, element });
      return true;
    },
    /** Takes the bubbles of these ids away (they are messages now); with no ids, all of them. Returns the texts taken away. */
    remove(ids = null) {
      const gone = [];
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (ids && !ids.includes(pending[index].id)) continue;
        gone.unshift(pending[index].text);
        pending[index].element.remove();
        pending.splice(index, 1);
      }
      return gone;
    },
    /** Takes all the bubbles away but keeps what they said: [{ id, text }], to be added again under the message the reply goes on in. */
    detach() {
      const waiting = pending.map(({ id, text }) => ({ id, text }));
      pending.forEach((item) => item.element.remove());
      pending.length = 0;
      return waiting;
    },
    has: (id) => pending.some((item) => item.id === id),
    size: () => pending.length
  };
}
