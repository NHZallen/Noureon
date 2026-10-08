// A tool for finding what moves the composer while the keyboard is up on a phone: open the app with `?debugViewport` in the address, do
// what makes it jump, and press the copy button. A small panel at the top of what is seen shows, live, the numbers the phone gives the page
// (the seen area, the page's height and scroll), where the app, the composer and the "@" list are, and what has focus; and it writes down
// every change of those, every scroll the page's own code asks for (with where in the code it came from) and every focus change, with the
// time. Nothing is changed or kept: it only watches, and it goes away on the next load without the word in the address.

const LOG_MAX = 600;
const SHOWN_LINES = 9;
const STACK_LINES = 4;

const shortStack = () => String(new Error().stack || '')
  .split('\n')
  .slice(3, 3 + STACK_LINES)
  .map((line) => line.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\//, '(').slice(0, 120))
  .join(' < ');

const describe = (element) => {
  if (!element || element.nodeType !== 1) return String(element);
  const id = element.id ? `#${element.id}` : '';
  const cls = typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  return `${element.tagName.toLowerCase()}${id}${cls}`;
};

const rectOf = (element) => {
  if (!element?.getBoundingClientRect) return null;
  const rect = element.getBoundingClientRect();
  return [Math.round(rect.top), Math.round(rect.bottom)];
};

/** What the panel shows: one snapshot of the numbers. */
export function readViewportState(doc) {
  const view = doc.defaultView;
  const viewport = view.visualViewport;
  const root = doc.documentElement;
  const menu = doc.getElementById('cli-mention-menu');
  const chat = doc.getElementById('chat-container');
  return {
    vvH: viewport ? Math.round(viewport.height) : null,
    vvTop: viewport ? Math.round(viewport.offsetTop) : null,
    vvScale: viewport ? Number(viewport.scale.toFixed(2)) : null,
    innerH: view.innerHeight,
    scrollY: Math.round(view.scrollY),
    docH: root.scrollHeight,
    vvBottomVar: root.style.getPropertyValue('--vv-bottom') || '-',
    app: rectOf(doc.getElementById('app-container')),
    bar: rectOf(doc.getElementById('input-bar-container')),
    menu: menu && !menu.hidden ? [...(rectOf(menu) || []), menu.style.maxHeight || '-'] : 'closed',
    chat: chat ? [Math.round(chat.scrollTop), chat.scrollHeight - chat.clientHeight] : null,
    focus: describe(doc.activeElement)
  };
}

export function installViewportDebug(doc = document, { now = () => Date.now() } = {}) {
  const view = doc.defaultView;
  if (!view || !doc.body) return () => {};
  const began = now();
  const log = [];
  const undo = [];
  const write = (kind, detail = '') => {
    log.push({ t: now() - began, kind, detail, state: readViewportState(doc) });
    if (log.length > LOG_MAX) log.shift();
  };

  const panel = doc.createElement('div');
  panel.id = 'viewport-debug';
  panel.setAttribute('aria-hidden', 'true');
  panel.style.cssText = [
    'position:fixed', 'left:4px', 'right:4px', 'top:0', 'z-index:2147483647', 'pointer-events:none',
    'font:10px/1.3 ui-monospace,Menlo,monospace', 'white-space:pre-wrap', 'word-break:break-all',
    'padding:4px 6px', 'border-radius:6px', 'background:var(--modal-bg)', 'color:var(--text-primary)',
    'border:1px solid var(--border-color)', 'opacity:0.92', 'max-height:42vh', 'overflow:hidden'
  ].join(';');
  const text = doc.createElement('div');
  const copy = doc.createElement('button');
  copy.type = 'button';
  copy.textContent = '⧉';
  copy.setAttribute('aria-label', 'Copy the viewport log');
  copy.style.cssText = 'pointer-events:auto;position:absolute;right:4px;top:4px;font-size:14px;padding:2px 8px;border-radius:6px;border:1px solid var(--border-color);background:var(--hover-bg);color:var(--text-primary)';
  // The copy does not take focus from the composer (that would close the keyboard and change what is being measured).
  copy.addEventListener('mousedown', (event) => event.preventDefault());
  copy.addEventListener('touchstart', (event) => event.preventDefault(), { passive: false });
  copy.addEventListener('touchend', (event) => { event.preventDefault(); copyLog(); }, { passive: false });
  copy.addEventListener('click', () => copyLog());
  panel.append(text, copy);
  doc.body.append(panel);

  const copyLog = () => {
    const payload = JSON.stringify({ userAgent: view.navigator.userAgent, log }, null, 0);
    const done = () => { copy.textContent = '✓'; view.setTimeout(() => { copy.textContent = '⧉'; }, 1200); };
    if (view.navigator.clipboard?.writeText) view.navigator.clipboard.writeText(payload).then(done, () => {});
    write('copied', `${log.length} entries`);
  };

  // What the phone and the page do.
  const viewport = view.visualViewport;
  const on = (target, name, listener, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(name, listener, options);
    undo.push(() => target.removeEventListener(name, listener, options));
  };
  on(viewport, 'resize', () => write('vv:resize'));
  on(viewport, 'scroll', () => write('vv:scroll'));
  on(view, 'scroll', () => write('window:scroll'), { passive: true });
  on(view, 'resize', () => write('window:resize'));
  on(doc, 'focusin', (event) => write('focusin', describe(event.target)), true);
  on(doc, 'focusout', (event) => write('focusout', describe(event.target)), true);
  on(doc, 'touchstart', (event) => write('touchstart', describe(event.target)), { capture: true, passive: true });
  on(doc, 'touchend', (event) => write('touchend', describe(event.target)), { capture: true, passive: true });
  on(doc, 'input', (event) => write('input', describe(event.target)), true);

  // Every scroll the page's own code asks for, with where it came from.
  const wrap = (owner, name, label) => {
    const original = owner?.[name];
    if (typeof original !== 'function') return;
    owner[name] = function patched(...args) {
      write(label, `${this === view ? 'window' : describe(this)} ${JSON.stringify(args[0] ?? null)} ${shortStack()}`);
      return original.apply(this, args);
    };
    undo.push(() => { owner[name] = original; });
  };
  wrap(view, 'scrollTo', 'call:scrollTo');
  wrap(view, 'scrollBy', 'call:scrollBy');
  wrap(view.Element.prototype, 'scrollIntoView', 'call:scrollIntoView');
  wrap(view.HTMLElement.prototype, 'focus', 'call:focus');

  // Changes of the app's own size (the variable of viewport-lock.js) and of the "@" list.
  const watch = (target, options, label) => {
    if (!target || typeof view.MutationObserver !== 'function') return;
    const observer = new view.MutationObserver(() => write(label));
    observer.observe(target, options);
    undo.push(() => observer.disconnect());
  };
  watch(doc.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] }, 'html:style');
  const menuWatch = () => watch(doc.getElementById('cli-mention-menu'), { attributes: true, attributeFilter: ['hidden', 'style'], childList: true }, 'menu');
  if (doc.getElementById('cli-mention-menu')) menuWatch();
  else {
    const waiter = new view.MutationObserver(() => {
      if (!doc.getElementById('cli-mention-menu')) return;
      waiter.disconnect();
      menuWatch();
    });
    waiter.observe(doc.body, { childList: true, subtree: true });
    undo.push(() => waiter.disconnect());
  }

  // The panel: the numbers now, and the last few things that happened. It sits at the top of what is seen (moving it does not move anything else).
  let frame = 0;
  let previous = '';
  const paint = () => {
    const state = readViewportState(doc);
    const current = JSON.stringify(state);
    if (current !== previous) {
      // A change no event above explains (the browser's own layout, an animation) is written too.
      if (previous) write('changed');
      previous = current;
    }
    const s = state;
    const head = `vv h${s.vvH} top${s.vvTop} x${s.vvScale} | inner${s.innerH} scrollY${s.scrollY} doc${s.docH}\nvar${s.vvBottomVar} app${JSON.stringify(s.app)} bar${JSON.stringify(s.bar)}\nmenu${JSON.stringify(s.menu)} chat${JSON.stringify(s.chat)} focus ${s.focus}`;
    const lines = log.slice(-SHOWN_LINES).map((entry) => `${entry.t} ${entry.kind} ${String(entry.detail).slice(0, 70)}`).join('\n');
    text.textContent = `${head}\n${lines}`;
    panel.style.transform = `translateY(${viewport ? Math.round(viewport.offsetTop) : 0}px)`;
    frame = view.requestAnimationFrame?.(paint) || 0;
  };
  write('start', view.navigator.userAgent);
  paint();

  return () => {
    if (frame) view.cancelAnimationFrame?.(frame);
    undo.forEach((step) => step());
    panel.remove();
  };
}
