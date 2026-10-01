// Developer-only scroll diagnostics (shown to everyone for now; ?noscrolldebug hides them). It records, on the
// device itself, what happens around the chat scroller: touches (and whether anything cancelled them),
// scroll events and where they land, every write to the chat's scroll position together with the code
// that made it, and viewport resizes. The log is drawn in a small panel that never takes a touch, so a
// screen recording shows the evidence. Nothing here changes how the page behaves.

import { chatsUnderVisionCheck } from '../runtime/features/vision-check-lock.js';
import { setEndRoomEnabled } from '../ui/motion/reader-scroll-guard.js';

const MAX_LINES = 14;
// The longest time, in the last ten seconds, that the page went without drawing a frame.
let stallMax = 0;

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

// The nearest element under the finger that can scroll by itself (a thinking, code or output box): a swipe that starts
// on one is given to it first.
const scrollBoxUnder = (node) => {
  for (let el = node instanceof Element ? node : node?.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.id === 'chat-container') return null;
    const style = getComputedStyle(el);
    const scrollsY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (scrollsY || scrollsX) return el;
  }
  return null;
};

let debugLog = null;
// The address as it was when the page loaded (main.js reads it before start-up rewrites it).
let initialParams = new URLSearchParams();

// Stage 1, right after the shell mounts: only the panel and a log of page errors, so a start-up that never
// finishes shows why. Nothing is wrapped yet, so start-up runs exactly as it does without the panel.
export function installScrollDebugPanel(doc = document, params = new URLSearchParams()) {
  const view = doc.defaultView;
  if (!view || debugLog) return;
  initialParams = params;
  // ?osb=off / ?osb=on is remembered on this device, so the A/B choice survives reloads and addresses
  // that lose their query.
  try {
    const osb = params.get('osb');
    if (osb === 'off') view.localStorage.setItem('scrollDebugOsb', 'off');
    if (osb === 'on') view.localStorage.removeItem('scrollDebugOsb');
  } catch {}

  // ?room=on gives the chat and the thinking boxes extra range at their ends (off by default), ?room=off takes it away
  // again; remembered on this device.
  let roomOn = false;
  try {
    const room = params.get('room');
    if (room === 'on') view.localStorage.setItem('scrollDebugRoom', 'on');
    if (room === 'off') view.localStorage.removeItem('scrollDebugRoom');
    roomOn = view.localStorage.getItem('scrollDebugRoom') === 'on';
  } catch {
    roomOn = params.get('room') === 'on';
  }
  setEndRoomEnabled(roomOn);

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
    const max = Math.round(maxTop());
    const main = chat.parentElement;
    const root = doc.scrollingElement;
    const guard = chat.__readerGuard;
    const hold = guard ? `${guard.holding ? 'HOLD' : 'free'}${guard.holding ? `(${Math.round((Date.now() - guard.holdStamp) / 100) / 10}s)` : ''}` : 'noguard';
    return `chat ${chat.scrollTop.toFixed(2)}/${max}${max - chat.scrollTop <= 1.5 ? ' BOTTOM' : ''} guard=${hold} stall=${stallMax}ms lock=${chatsUnderVisionCheck.size} ROOM-${roomOn ? 'ON' : 'OFF'} room=${chat.style.getPropertyValue('--end-room') || '0'} osb=${view.getComputedStyle(chat).overscrollBehaviorY} | main ${Math.round(main?.scrollTop || 0)} | root ${Math.round(root?.scrollTop || 0)} | vv ${Math.round(view.visualViewport?.height || 0)}@${Math.round(view.visualViewport?.offsetTop || 0)} | win ${view.innerHeight}`;
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
  // Main-thread stalls: a frame that comes much later than it should. A swipe cannot start while the page is blocked
  // (a non-passive touch listener makes the browser wait for it), so a stall that lines up with a frozen chat is the
  // cause. Logged when over 250 ms; the longest of the last ten seconds is in the status line.
  const recent = [];
  let lastFrame = view.performance.now();
  const watchFrames = (now) => {
    const gap = now - lastFrame;
    lastFrame = now;
    if (!doc.hidden && gap > 250) {
      log(`STALL ${Math.round(gap)}ms (page drew no frame)`);
      recent.push({ at: now, gap });
    }
    while (recent.length && now - recent[0].at > 10000) recent.shift();
    stallMax = Math.round(recent.reduce((most, entry) => Math.max(most, entry.gap), 0));
    view.requestAnimationFrame(watchFrames);
  };
  view.requestAnimationFrame(watchFrames);
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
  let osbOff = initialParams.get('osb') === 'off';
  try { osbOff = osbOff || view.localStorage.getItem('scrollDebugOsb') === 'off'; } catch {}
  if (osbOff) {
    chat.style.setProperty('overscroll-behavior-y', 'auto', 'important');
    chat.style.setProperty('overscroll-behavior', 'auto', 'important');
  }
  log(`overscroll-behavior-y=${view.getComputedStyle(chat).overscrollBehaviorY}`);

  // Touches: one line when a finger lands and one summary when it lifts or is cancelled.
  let gesture = null;
  const onTouchStart = (event) => {
    const touch = event.touches[0];
    gesture = { y: touch?.clientY || 0, moves: 0, prevented: false, top: chat.scrollTop, target: describe(event.target), node: event.target, at: view.performance.now(), firstScroll: null };
    const started = gesture;
    // A touchend that never comes (the element under the finger was removed) is what leaves the app thinking a finger is down.
    view.setTimeout(() => {
      if (gesture === started) log(`NO TE after 2s: target ${started.target} ${started.node?.isConnected ? 'still in the page' : 'REMOVED from the page'} stall=${stallMax}ms`);
    }, 2000);
    const max = chat.scrollHeight - chat.clientHeight;
    log(`TS  room=${chat.style.getPropertyValue('--end-room') || '0'} y=${Math.round(gesture.y)} n=${event.touches.length} on ${gesture.target} chat=${chat.scrollTop.toFixed(2)}/${max} gapEnd=${(max - chat.scrollTop).toFixed(2)} gapTop=${chat.scrollTop.toFixed(2)}`);
    const box = scrollBoxUnder(event.target);
    if (box) log(`    box ${describe(box)} ${box.scrollTop.toFixed(1)}/${box.scrollHeight - box.clientHeight}`);
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
    const moved = Math.round((chat.scrollTop - gesture.top) * 10) / 10;
    log(`${kind} moves=${gesture.moves} finger=${dy} chatMoved=${moved} firstScroll=${gesture.firstScroll === null ? 'none' : `${gesture.firstScroll}ms`} target=${gesture.node?.isConnected ? 'ok' : 'REMOVED'}${gesture.prevented || event.defaultPrevented ? ' PREVENTED' : ''}`);
    gesture = null;
  };
  // Capture phase on window runs before any page listener, so a listener that stops propagation cannot hide a
  // touch. Whether anything cancelled it is read once the event has been fully dispatched.
  const afterDispatch = (event, callback) => view.setTimeout(() => callback(event.defaultPrevented), 0);
  view.addEventListener('touchstart', (event) => {
    onTouchStart(event);
    afterDispatch(event, (prevented) => { if (prevented) log('TS  was PREVENTED'); });
  }, { capture: true, passive: true });
  view.addEventListener('touchmove', (event) => {
    onTouchMove(event);
    const current = gesture;
    afterDispatch(event, (prevented) => { if (prevented && current) current.prevented = true; });
  }, { capture: true, passive: true });
  const endGesture = (kind) => (event) => afterDispatch(event, (prevented) => {
    if (prevented && gesture) gesture.prevented = true;
    finish(kind)(event);
  });
  view.addEventListener('touchend', endGesture('TE '), { capture: true, passive: true });
  view.addEventListener('touchcancel', endGesture('TC!'), { capture: true, passive: true });

  // Scroll events on any element, grouped per element for 150 ms so a fling is one line.
  const pending = new Map();
  doc.addEventListener('scroll', (event) => {
    const target = event.target === doc ? doc.scrollingElement : event.target;
    const name = describe(event.target);
    if (gesture && gesture.firstScroll === null) gesture.firstScroll = Math.round(view.performance.now() - gesture.at);
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

  // The room given to the chat at its end (reader-scroll-guard.js): when it changes, and that nothing moved with it.
  let lastRoom = chat.style.getPropertyValue('--end-room') || '0';
  new view.MutationObserver(() => {
    const room = chat.style.getPropertyValue('--end-room') || '0';
    if (room === lastRoom) return;
    log(`ROOM ${lastRoom} -> ${room} at ${chat.scrollTop.toFixed(2)}/${chat.scrollHeight - chat.clientHeight}`);
    lastRoom = room;
  }).observe(chat, { attributes: true, attributeFilter: ['style'] });

  view.visualViewport?.addEventListener('resize', () => log(`VV  resize h=${Math.round(view.visualViewport.height)}`));
  view.addEventListener('resize', () => log(`WIN resize h=${view.innerHeight}`));
  log('watching the chat');
}
