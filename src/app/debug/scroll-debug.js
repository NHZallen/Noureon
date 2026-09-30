// Developer-only scroll diagnostics, loaded only when the address has ?scrolldebug. It records, on the
// device itself, what happens around the chat scroller: touches (and whether anything cancelled them),
// scroll events and where they land, every write to the chat's scroll position together with the code
// that made it, and viewport resizes. The log is drawn in a small panel that never takes a touch, so a
// screen recording shows the evidence. Nothing here changes how the page behaves.

const MAX_LINES = 14;

const describe = (node) => {
  if (!node || node === document) return 'document';
  if (node === window) return 'window';
  if (!(node instanceof Element)) return String(node?.nodeName || node);
  if (node.id) return `#${node.id}`;
  const cls = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : '';
  return `${node.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
};

const callerOf = (stack) => {
  const lines = String(stack || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const frame = lines.find((line) => !/scroll-debug/.test(line) && /[/:]/.test(line)) || '';
  const match = frame.match(/(?:at\s+)?([^\s@(]*)[@(\s]*.*\/([^/]+?\.js)(?:\?[^:]*)?:(\d+)/);
  return match ? `${match[1] || 'anon'} ${match[2]}:${match[3]}` : frame.slice(0, 60);
};

let debugLog = null;

// Stage 1, right after the shell mounts: only the panel and a log of page errors, so a start-up that never
// finishes shows why. Nothing is wrapped yet, so start-up runs exactly as it does without the panel.
export function installScrollDebugPanel(doc = document) {
  const view = doc.defaultView;
  if (!view || debugLog) return;

  const started = view.performance.now();
  const stamp = () => `${((view.performance.now() - started) / 1000).toFixed(2)}`.padStart(6, ' ');
  const lines = [];
  const panel = doc.createElement('pre');
  panel.id = 'scroll-debug-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.style.cssText = [
    'position:fixed', 'left:4px', 'right:4px', 'top:calc(env(safe-area-inset-top,0px) + 56px)', 'z-index:2147483647',
    'margin:0', 'padding:6px 8px', 'max-height:46vh', 'overflow:hidden', 'pointer-events:none',
    'background:rgba(0,0,0,.78)', 'color:#7CFC8A', 'font:10px/1.35 ui-monospace,Menlo,monospace',
    'white-space:pre-wrap', 'word-break:break-all', 'border-radius:8px'
  ].join(';');
  doc.body.appendChild(panel);

  const status = () => {
    const chat = doc.getElementById('chat-container');
    if (!chat) return 'chat -';
    const maxTop = () => Math.max(0, chat.scrollHeight - chat.clientHeight);
    const top = Math.round(chat.scrollTop);
    const max = Math.round(maxTop());
    const main = chat.parentElement;
    const root = doc.scrollingElement;
    return `chat ${top}/${max}${max - top <= 1 ? ' BOTTOM' : ''} osb=${view.getComputedStyle(chat).overscrollBehaviorY} | main ${Math.round(main?.scrollTop || 0)} | root ${Math.round(root?.scrollTop || 0)} | vv ${Math.round(view.visualViewport?.height || 0)}@${Math.round(view.visualViewport?.offsetTop || 0)} | win ${view.innerHeight}`;
  };
  let frame = 0;
  const render = () => {
    frame = 0;
    panel.textContent = `${status()}\n${lines.join('\n')}`;
  };
  const log = (text) => {
    lines.push(`${stamp()} ${text}`);
    while (lines.length > MAX_LINES) lines.shift();
    if (!frame) frame = view.requestAnimationFrame(render);
  };

  view.addEventListener('error', (event) => log(`ERR ${event.message || event.type} ${String(event.filename || '').split('/').pop()}:${event.lineno || ''}`));
  view.addEventListener('unhandledrejection', (event) => log(`REJ ${event.reason?.message || String(event.reason).slice(0, 120)}`));
  view.setInterval(render, 250);
  debugLog = { log, view };
  log('scroll debug on (waiting for the app)');
}

// Stage 2, once the app is interactive: watch touches, scrolling and every write to the chat's position.
export function watchChatScrolling(doc = document) {
  const chat = doc.getElementById('chat-container');
  if (!debugLog || !chat || chat.dataset.scrollDebug) return;
  chat.dataset.scrollDebug = 'on';
  const { log, view } = debugLog;
  // A/B switch: ?osb=off turns off overscroll-behavior on the chat scroller only, to test whether it
  // causes the swipe from the end of the chat to spring back.
  if (new URLSearchParams(view.location.search).get('osb') === 'off') {
    chat.style.setProperty('overscroll-behavior-y', 'auto', 'important');
    chat.style.setProperty('overscroll-behavior', 'auto', 'important');
  }
  log(`overscroll-behavior-y=${view.getComputedStyle(chat).overscrollBehaviorY}`);

  // Touches: one line when a finger lands and one summary when it lifts or is cancelled.
  let gesture = null;
  const onTouchStart = (event) => {
    const touch = event.touches[0];
    gesture = { y: touch?.clientY || 0, moves: 0, prevented: false, top: chat.scrollTop, target: describe(event.target) };
    log(`TS  y=${Math.round(gesture.y)} n=${event.touches.length} on ${gesture.target} chat=${Math.round(chat.scrollTop)}`);
  };
  const onTouchMove = (event) => {
    if (!gesture) return;
    gesture.moves += 1;
    gesture.lastY = event.touches[0]?.clientY;
    if (event.defaultPrevented) gesture.prevented = true;
    if (gesture.moves === 1) log(`TM1 dy=${Math.round((gesture.lastY || 0) - gesture.y)} cancelable=${event.cancelable}${event.defaultPrevented ? ' PREVENTED' : ''}`);
  };
  const finish = (kind) => (event) => {
    if (!gesture) return;
    const dy = Math.round((gesture.lastY ?? gesture.y) - gesture.y);
    const moved = Math.round(chat.scrollTop - gesture.top);
    log(`${kind} moves=${gesture.moves} finger=${dy} chatMoved=${moved}${gesture.prevented || event.defaultPrevented ? ' PREVENTED' : ''}`);
    gesture = null;
  };
  // Window, bubble phase, passive: runs after every other listener, so defaultPrevented is final.
  view.addEventListener('touchstart', onTouchStart, { passive: true });
  view.addEventListener('touchmove', onTouchMove, { passive: true });
  view.addEventListener('touchend', finish('TE '), { passive: true });
  view.addEventListener('touchcancel', finish('TC!'), { passive: true });

  // Scroll events on any element, grouped per element for 150 ms so a fling is one line.
  const pending = new Map();
  doc.addEventListener('scroll', (event) => {
    const target = event.target === doc ? doc.scrollingElement : event.target;
    const name = describe(event.target);
    if (!pending.has(name)) {
      pending.set(name, { count: 0, from: Math.round(target?.scrollTop || 0) });
      view.setTimeout(() => {
        const entry = pending.get(name);
        pending.delete(name);
        log(`SC  ${name} x${entry.count} ${entry.from}->${Math.round(target?.scrollTop || 0)}`);
      }, 150);
    }
    pending.get(name).count += 1;
  }, { capture: true, passive: true });

  // Every script write to the chat's scroll position, with the code that made it.
  const proto = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
  Object.defineProperty(chat, 'scrollTop', {
    configurable: true,
    get() { return proto.get.call(this); },
    set(value) {
      log(`W   scrollTop=${Math.round(value)} from ${Math.round(proto.get.call(this))} by ${callerOf(new Error().stack)}`);
      proto.set.call(this, value);
    }
  });
  for (const method of ['scrollTo', 'scroll', 'scrollBy']) {
    const original = chat[method];
    chat[method] = function (...args) {
      const target = typeof args[0] === 'object' ? args[0]?.top : args[1];
      log(`W   ${method}(${Math.round(Number(target) || 0)}) by ${callerOf(new Error().stack)}`);
      return original.apply(this, args);
    };
  }
  const originalIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    if (chat.contains(this)) log(`W   scrollIntoView ${describe(this)} by ${callerOf(new Error().stack)}`);
    return originalIntoView.apply(this, args);
  };
  const originalWindowScroll = view.scrollTo.bind(view);
  view.scrollTo = (...args) => {
    log(`W   window.scrollTo by ${callerOf(new Error().stack)}`);
    return originalWindowScroll(...args);
  };

  view.visualViewport?.addEventListener('resize', () => log(`VV  resize h=${Math.round(view.visualViewport.height)}`));
  view.addEventListener('resize', () => log(`WIN resize h=${view.innerHeight}`));
  log('watching the chat');
}
