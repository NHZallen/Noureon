// A tool for finding what moves the chat by itself: open the app with `?debugScroll` in the address, do what makes the chat jump, and
// copy what the console says. Every move the page's own code makes to the chat's position (and every change of how tall the messages
// are) is written with how long ago the person last touched the chat, and where in the code it came from. Nothing is changed or kept.

const STACK_LINES = 5;
const USER_INPUTS = ['wheel', 'touchstart', 'touchmove', 'keydown', 'mousedown'];

const shortStack = () => String(new Error().stack || '')
  .split('\n')
  .slice(3, 3 + STACK_LINES)
  .map((line) => line.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\//, '(').slice(0, 140))
  .join(' < ');

export function installScrollDebug(doc = document, { write = (...args) => console.warn(...args), now = () => Date.now() } = {}) {
  const view = doc.defaultView;
  const chat = doc.getElementById('chat-container');
  if (!view || !chat) return () => {};
  const began = now();
  let lastInput = -Infinity;
  const touched = () => { lastInput = now(); };
  USER_INPUTS.forEach((name) => doc.addEventListener(name, touched, { capture: true, passive: true }));
  const stamp = () => `${now() - began}ms, ${Number.isFinite(lastInput) ? `${now() - lastInput}ms after the person last touched` : 'never touched'}`;

  const proto = view.Element.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
  const restore = [];
  if (descriptor?.set) {
    Object.defineProperty(proto, 'scrollTop', {
      ...descriptor,
      set(value) {
        if (this === chat) write('[scroll-debug] scrollTop', Math.round(this.scrollTop), '->', Math.round(value), `(${stamp()})`, shortStack());
        descriptor.set.call(this, value);
      }
    });
    restore.push(() => Object.defineProperty(proto, 'scrollTop', descriptor));
  }
  for (const name of ['scrollTo', 'scrollBy', 'scrollIntoView']) {
    const original = proto[name];
    if (typeof original !== 'function') continue;
    proto[name] = function patched(...args) {
      if (this === chat || (name === 'scrollIntoView' && chat.contains(this))) write(`[scroll-debug] ${name}`, JSON.stringify(args[0] ?? null), `(${stamp()})`, shortStack());
      return original.apply(this, args);
    };
    restore.push(() => { proto[name] = original; });
  }

  // How tall the messages are, and each move of the position that no call above explains (the browser's own).
  let height = chat.scrollHeight;
  let top = chat.scrollTop;
  const onScroll = () => {
    const moved = Math.round(chat.scrollTop - top);
    top = chat.scrollTop;
    if (moved) write('[scroll-debug] position moved', moved, 'px to', Math.round(top), `(${stamp()}, ${Math.round(chat.scrollHeight - chat.clientHeight - top)}px from the end)`);
  };
  chat.addEventListener('scroll', onScroll, { passive: true });
  const timer = view.setInterval(() => {
    const next = chat.scrollHeight;
    if (next !== height) write('[scroll-debug] height', height, '->', next, `(${stamp()})`);
    height = next;
  }, 100);
  write('[scroll-debug] on: moves of the chat are logged here');
  return () => {
    USER_INPUTS.forEach((name) => doc.removeEventListener(name, touched, { capture: true }));
    chat.removeEventListener('scroll', onScroll);
    view.clearInterval(timer);
    restore.forEach((undo) => undo());
  };
}
