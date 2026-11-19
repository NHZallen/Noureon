// The real picture of the browser agent: neko's WebRTC stream and its control messages (design doc section 12.2; written from what was measured on the real host, not from memory).
// It is a "source" of live-view.js: mount(el), mountLens(el), input { pointer, wheel, key, text }, destroy(); plus setQuality('lq' | 'hq'), screen size updates and a state callback.
//   - The page opens wss://<host><wsPath>?token=<token> (the one-time viewer the main server asked the host for). The host's proxy only lets that one path through.
//   - Signalling: signal/request -> signal/provide (the server offers first) -> signal/answer, signal/candidate both ways. Video only; no sound.
//   - One MediaStream is given to every <video> (the card, the focus mode and the glass circle each have one).
//   - Input is sent only when the person has taken over (the host also refuses it otherwise): control/move, buttondown/up, scroll, keydown/up, paste.
// Everything that touches the browser (WebSocket, RTCPeerConnection) comes in as a parameter, so tests run with fakes.

const KEYSYMS = {
  Enter: 0xff0d, Backspace: 0xff08, Tab: 0xff09, Escape: 0xff1b, Delete: 0xffff, Home: 0xff50, End: 0xff57, PageUp: 0xff55, PageDown: 0xff56,
  ArrowLeft: 0xff51, ArrowUp: 0xff52, ArrowRight: 0xff53, ArrowDown: 0xff54, Insert: 0xff63,
  Shift: 0xffe1, Control: 0xffe3, Alt: 0xffe9, Meta: 0xffeb, CapsLock: 0xffe5,
  F1: 0xffbe, F2: 0xffbf, F3: 0xffc0, F4: 0xffc1, F5: 0xffc2, F6: 0xffc3, F7: 0xffc4, F8: 0xffc5, F9: 0xffc6, F10: 0xffc7, F11: 0xffc8, F12: 0xffc9
};
const MODIFIERS = new Set(['Control', 'Alt', 'Meta']);
const WHEEL_UNIT = 120; // one notch of a wheel, as a DOM wheel event counts it
const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * `viewer`: { token, host, wsPath } from the main server. `size`: the screen of the browser in pixels, { w, h } (neko says it again when it changes).
 * `quality`: 'lq' for the card, 'hq' for the focus mode.
 */
export function createNekoSource({ viewer, size = { w: 1024, h: 768 }, quality = 'lq', document, WebSocketImpl = globalThis.WebSocket, RTCImpl = globalThis.RTCPeerConnection, MediaStreamImpl = globalThis.MediaStream, onState = () => {} }) {
  if (!/^[a-z0-9.-]+$/i.test(String(viewer?.host || '')) || !/^\/s\/[0-9a-f]{32}\/api\/ws$/.test(String(viewer?.wsPath || ''))) throw new Error('That live screen address is not valid.');
  const url = `wss://${viewer.host}${viewer.wsPath}?token=${encodeURIComponent(viewer.token)}`;
  const videos = new Set();
  let screen = { w: size.w, h: size.h };
  let stream = null;
  let pc = null;
  let socket = null;
  let wanted = quality;
  let destroyed = false;
  let state = 'connecting';
  const held = new Set();
  let wheelRemainder = { x: 0, y: 0 };
  const pending = []; // candidates that arrived before the offer

  const setState = (next, reason = '') => { if (state === next || destroyed) return; state = next; onState(next, reason); };
  let mediaTimer = null;
  const send = (event, payload = {}) => { if (socket && socket.readyState === 1) socket.send(JSON.stringify({ event, payload })); };
  const attach = (video) => { if (stream && video.srcObject !== stream) video.srcObject = stream; video.play?.()?.catch?.(() => {}); };
  const select = (id) => ({ selector: { id, type: 'exact' } });

  async function onProvide(payload) {
    pc?.close();
    pc = new RTCImpl({ iceServers: Array.isArray(payload.iceservers) ? payload.iceservers : [] });
    pc.ontrack = (event) => {
      stream = event.streams?.[0] || (MediaStreamImpl ? new MediaStreamImpl([event.track]) : null);
      for (const video of videos) attach(video);
      clearTimeout(mediaTimer);
      setState('live');
    };
    pc.onicecandidate = (event) => { if (event.candidate) send('signal/candidate', event.candidate.toJSON ? event.candidate.toJSON() : event.candidate); };
    let dropTimer = null;
    pc.onconnectionstatechange = () => {
      clearTimeout(dropTimer);
      if (pc?.connectionState === 'failed' || pc?.connectionState === 'closed') setState('closed', `rtc-${pc.connectionState}`);
      // A connection that was cut (the phone changed network, or came back from sleep) may not say that it failed: when it has not come back in a few seconds it is let go.
      else if (pc?.connectionState === 'disconnected') dropTimer = setTimeout(() => { if (pc?.connectionState === 'disconnected') setState('closed', 'rtc-disconnected'); }, 4000);
    };
    // The offer came but no picture: the media does not get through (a network that blocks it); say so instead of waiting for ever.
    clearTimeout(mediaTimer);
    mediaTimer = setTimeout(() => { if (state !== 'live') setState('closed', 'no-media'); }, 15_000);
    await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
    for (const candidate of pending.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send('signal/answer', { sdp: answer.sdp });
  }

  const handlers = {
    'system/init': (payload) => {
      const next = payload?.screen_size;
      if (next?.width > 0 && next?.height > 0) screen = { w: next.width, h: next.height };
      send('signal/request', { video: select(wanted), audio: { disabled: true } });
    },
    'signal/provide': (payload) => { void onProvide(payload || {}).catch(() => setState('closed', 'rtc-setup')); },
    'signal/candidate': (payload) => { if (pc?.remoteDescription) void pc.addIceCandidate(payload).catch(() => {}); else pending.push(payload); },
    'screen/updated': (payload) => { if (payload?.width > 0 && payload?.height > 0) screen = { w: payload.width, h: payload.height }; },
    'system/disconnect': (payload) => setState('closed', `server-${String(payload?.message || payload || 'disconnect').slice(0, 60)}`)
  };

  socket = new WebSocketImpl(url);
  socket.onmessage = (message) => {
    let data;
    try { data = JSON.parse(typeof message.data === 'string' ? message.data : ''); } catch { return; }
    handlers[data?.event]?.(data.payload);
  };
  socket.onclose = (event) => setState('closed', `ws-closed-${event?.code ?? ''}`);
  socket.onerror = () => setState('closed', 'ws-error');

  const pixel = (x, y) => ({ x: Math.min(screen.w - 1, Math.floor(clamp01(x) * screen.w)), y: Math.min(screen.h - 1, Math.floor(clamp01(y) * screen.h)) });
  const keysymOf = (key) => {
    if (KEYSYMS[key] !== undefined) return KEYSYMS[key];
    if (typeof key === 'string' && key.length === 1) return key.toLowerCase().codePointAt(0);
    return null;
  };

  const input = {
    pointer(x, y, kind) {
      const at = pixel(x, y);
      send('control/move', at);
      if (kind === 'down') send('control/buttondown', { code: 1, ...at });
      else if (kind === 'up') send('control/buttonup', { code: 1, ...at });
    },
    /** DOM-style deltas in pixels (positive = down / right); neko counts notches the other way round (negative = down). Small amounts are kept until they make a notch. */
    wheel(dx, dy, x, y) {
      if (x !== undefined) send('control/move', pixel(x, y));
      wheelRemainder.x += dx / WHEEL_UNIT; wheelRemainder.y += dy / WHEEL_UNIT;
      const notchesX = Math.trunc(wheelRemainder.x); const notchesY = Math.trunc(wheelRemainder.y);
      if (!notchesX && !notchesY) return;
      wheelRemainder = { x: wheelRemainder.x - notchesX, y: wheelRemainder.y - notchesY };
      send('control/scroll', { delta_x: 0 - notchesX, delta_y: 0 - notchesY, control_key: false });
    },
    /** A key of the person. Letters, digits and symbols are pasted (the only way capitals and other scripts come out right); named keys and shortcuts (with Ctrl, Alt or Meta held) are keysyms. */
    key(key, down) {
      if (MODIFIERS.has(key)) { if (down) held.add(key); else held.delete(key); }
      const shortcut = held.size > 0;
      if (typeof key === 'string' && key.length >= 1 && [...key].length === 1 && !shortcut) {
        if (down) send('control/paste', { text: key });
        return;
      }
      const keysym = keysymOf(key);
      if (keysym === null) return;
      send(down ? 'control/keydown' : 'control/keyup', { keysym });
    },
    text(text) { if (typeof text === 'string' && text) send('control/paste', { text: text.slice(0, 20_000) }); }
  };

  const make = () => {
    const video = document.createElement('video');
    video.autoplay = true; video.muted = true; video.playsInline = true; video.setAttribute?.('playsinline', '');
    video.className = 'bl-video';
    return video;
  };
  // The view that draws the circle wants to know when the picture gets its size or changes it (a switch of the ratio).
  let onResize = null;
  const mountIn = (element) => {
    const video = make();
    videos.add(video);
    for (const name of ['loadedmetadata', 'resize']) video.addEventListener?.(name, () => onResize?.());
    element.append(video);
    attach(video);
    return video;
  };

  return {
    mount: mountIn,
    mountLens: mountIn,
    /** The size of the picture of the stream in pixels ({ width, height }), or null before the first frame. */
    videoSize() {
      const video = [...videos].find((candidate) => candidate.videoWidth > 0 && candidate.videoHeight > 0);
      return video ? { width: video.videoWidth, height: video.videoHeight } : null;
    },
    onVideoResize(callback) { onResize = typeof callback === 'function' ? callback : null; },
    input,
    /** The picture on the screen now, as a JPEG (a Blob), or null when nothing is shown yet. Drawn from the video of the stream, so it is exactly what the person sees. */
    async snapshot({ quality = 0.9 } = {}) {
      const video = [...videos].find((candidate) => candidate.videoWidth > 0 && candidate.videoHeight > 0);
      if (!video) return null;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve) => { try { canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', quality); } catch { resolve(null); } });
    },
    /** 'lq' (the card) or 'hq' (the focus mode and taking over); changed on the live connection without reconnecting. */
    setQuality(id) {
      if (id !== 'lq' && id !== 'hq') return;
      wanted = id;
      if (state === 'live') send('signal/video', select(id));
    },
    get state() { return state; },
    get screen() { return { ...screen }; },
    destroy() {
      destroyed = true;
      clearTimeout(mediaTimer);
      for (const video of videos) { video.srcObject = null; video.remove?.(); }
      videos.clear();
      try { pc?.close(); } catch { /* already closed */ }
      try { socket?.close(); } catch { /* already closed */ }
      pc = null; socket = null; stream = null;
    }
  };
}
