// The two small events between the page and the line under a reply (memory-reply-line.js): a message element was made, and the memory changed after a reply. Nothing here fails when the
// document cannot send events (a test).

export const MESSAGE_DRAWN_EVENT = 'noureon:message-drawn';
export const MEMORY_UPDATED_EVENT = 'noureon:memory-updated';

function send(document, name, detail) {
  try {
    const Event = document?.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (typeof document?.dispatchEvent === 'function' && typeof Event === 'function') document.dispatchEvent(new Event(name, { detail }));
  } catch { /* The line is drawn the next time the message is. */ }
}

export const announceMessageDrawn = (document, detail) => send(document, MESSAGE_DRAWN_EVENT, detail);
export const announceMemoryUpdated = (document, detail = {}) => send(document, MEMORY_UPDATED_EVENT, detail);
