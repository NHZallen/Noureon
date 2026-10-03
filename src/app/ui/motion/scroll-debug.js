// A tool for finding what moves the chat by itself: open the app with `?debugScroll` in the address, do what makes the chat jump, and
// copy what the little panel says (a phone has no console). Every move the page's own code makes to the chat's position (and every
// change of how tall the messages are) is written with how long ago the person last touched the chat, and where in the code it came
// from. Nothing is changed or kept.

const STACK_LINES = 5;
const USER_INPUTS = ['wheel', 'touchstart', 'touchmove', 'keydown', 'mousedown'];

const MAX_LINES = 150;

// A panel at the foot of the page: the lines, a button that copies them all, one that clears them, one that closes the panel.
function createPanel(doc) {
  const panel = doc.createElement('div');
  panel.setAttribute('data-scroll-debug', '');
  panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:38vh;display:flex;flex-direction:column;background:rgba(17,24,39,.94);color:#e5e7eb;font:11px/1.35 monospace;';
  const bar = doc.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;padding:6px 8px;border-bottom:1px solid #374151;align-items:center;';
  const body = doc.createElement('pre');
  body.style.cssText = 'margin:0;padding:6px 8px;overflow:auto;white-space:pre-wrap;word-break:break-all;flex:1;user-select:text;-webkit-user-select:text;';
  const lines = [];
  const button = (label, onClick) => {
    const element = doc.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.style.cssText = 'padding:6px 12px;border-radius:6px;border:1px solid #6b7280;background:#1f2937;color:#fff;font:12px sans-serif;';
    element.addEventListener('click', onClick);
    return element;
  };
  const status = doc.createElement('span');
  status.style.cssText = 'margin-left:auto;color:#9ca3af;';
  const copy = async () => {
    const text = lines.join('\n');
    try {
      await doc.defaultView.navigator.clipboard.writeText(text);
      status.textContent = 'Copied';
    } catch {
      // No clipboard: the text is selected, to copy by hand.
      const range = doc.createRange();
      range.selectNodeContents(body);
      const selection = doc.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Selected: copy it';
    }
  };
  bar.append(button('Copy', copy), button('Clear', () => { lines.length = 0; body.textContent = ''; status.textContent = ''; }), button('✕', () => panel.remove()), status);
  panel.append(bar, body);
  doc.body.append(panel);
  return {
    panel,
    add(line) {
      lines.push(line);
      if (lines.length > MAX_LINES) lines.shift();
      body.textContent = lines.join('\n');
      body.scrollTop = body.scrollHeight;
    }
  };
}

const shortStack = () => String(new Error().stack || '')
  .split('\n')
  .slice(3, 3 + STACK_LINES)
  .map((line) => line.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\//, '(').slice(0, 140))
  .join(' < ');

export function installScrollDebug(doc = document, { write: given = null, now = () => Date.now() } = {}) {
  const view = doc.defaultView;
  const chat = doc.getElementById('chat-container');
  if (!view || !chat) return () => {};
  const panel = given ? null : createPanel(doc);
  const write = given || ((...args) => {
    console.warn(...args);
    panel.add(args.map((part) => String(part)).join(' ').replace(/^\[scroll-debug\] /, ''));
  });
  const began = now();
  let lastInput = -Infinity;
  const touched = (event) => { if (!event?.target?.closest?.('[data-scroll-debug]')) lastInput = now(); };
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
    panel?.panel.remove();
  };
}
