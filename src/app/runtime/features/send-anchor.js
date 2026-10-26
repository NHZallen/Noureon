// After a message is sent, its bubble goes to the top of the chat and the reply is written below it, into room that is kept empty for it (the same as in ChatGPT and Claude): the person
// sees their own message and the start of the reply at once, and the chat does not carry them down to the end of a long reply. The room is the empty block at the end of the message
// list (--send-room, styles/chat-reply-layout.css); it shrinks as the reply fills it, and is nothing once the reply is taller than the chat. While there is room the chat is not "at
// its end", so the streaming does not follow the reply down (chat-scroll-position.js): the person scrolls down, or taps the button that goes to the end.

const ROOM = '--send-room';

// Always this much more while the bubble is held at the top: with none, a reply that has just filled the chat would rest at the chat's end, which the streaming follows (chat-scroll-position.js
// takes anything within 16 px of the end for "at the end"), and the bubble would be carried off the top. The person is at the end again only by scrolling down to it.
export const MIN_ROOM = 48;

/** The room to keep: what the chat shows, less the space above the bubble that the chat keeps clear, less what the bubble and everything after it already take (and MIN_ROOM more). */
export const roomFor = ({ viewport, topPad = 0, span = 0 }) => Math.max(0, Math.round(viewport - topPad - span)) + MIN_ROOM;

const state = { elements: null, ResizeObserver: null, requestFrame: (callback) => callback(), anchor: null, observer: null, shown: 0 };

const list = () => state.elements?.messageList || null;
const chat = () => state.elements?.chatContainer || null;
const pad = () => Number.parseFloat(globalThis.getComputedStyle?.(chat())?.scrollPaddingTop) || 0;

const setRoom = (px) => {
  if (!list()?.style || px === state.shown) return;
  state.shown = px;
  if (px > 0) list().style.setProperty(ROOM, `${px}px`);
  else list().style.removeProperty(ROOM);
};

const update = () => {
  const anchor = state.anchor;
  const messages = list()?.children;
  if (!anchor?.isConnected || !messages?.length) {
    release();
    return;
  }
  const span = messages[messages.length - 1].getBoundingClientRect().bottom - anchor.getBoundingClientRect().top;
  setRoom(roomFor({ viewport: chat().clientHeight, topPad: pad(), span }));
};

function release() {
  state.anchor = null;
  state.observer?.disconnect();
  state.observer = null;
  setRoom(0);
}

export const sendAnchor = {
  configure({ elements, ResizeObserver, requestFrame }) {
    state.elements = elements;
    state.ResizeObserver = ResizeObserver;
    // (Called on its own: a browser's requestAnimationFrame refuses to be called as a method of another object.)
    if (requestFrame) state.requestFrame = (callback) => requestFrame(callback);
  },
  /** The room that is kept now (px): the button that goes to the end of the chat goes to the end of the messages, not of the room. */
  room: () => state.shown,
  /** The message just sent: its bubble goes to the top, with the room for the reply below it. */
  anchorTo(element) {
    if (!element || !chat() || !list()) return;
    release();
    state.anchor = element;
    update();
    if (typeof state.ResizeObserver === 'function') {
      state.observer = new state.ResizeObserver(update);
      state.observer.observe(list());
      state.observer.observe(chat());
    }
    state.requestFrame(() => {
      if (state.anchor !== element || !element.isConnected) return;
      update();
      const top = element.getBoundingClientRect().top - chat().getBoundingClientRect().top + chat().scrollTop - pad();
      chat().scrollTo?.({ top: Math.max(0, top), behavior: 'smooth' });
    });
  },
  release
};
