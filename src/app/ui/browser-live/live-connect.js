// Joins the card of the browser agent to the real live screen (design sections 6 and 16): asks the server for a temporary viewer, opens neko's stream, hands the picture and the
// person's buttons to the card, and lets everything go again as soon as nobody looks (the card is a pill or turned over, the reply is over). Nothing is streamed that nobody sees.
//   api(method, path, body) -> { ok, status, data }   (the signed-in request of the page to the server)
// The server's routes: POST /v1/browser/:id/viewer, DELETE /v1/browser/:id/viewer/:viewerId, POST /v1/browser/:id/control, POST /v1/browser/:id/screen.

import { createNekoSource } from './neko-source.js';

const RETRY_MS = [1500, 4000, 10_000];
// A stream that lived this long was a real one: the tries start again after it. A stream that ends within seconds is a failure however often it comes back.
const STABLE_MS = 20_000;

export function connectBrowserLive({ card, sessionId, api, document, createSource = createNekoSource, readClipboard = null, setTimer = (...a) => setTimeout(...a), clearTimer = (...a) => clearTimeout(...a), now = Date.now, log = (...a) => console.info('[browser-live]', ...a), setRepeat = (...a) => setInterval(...a), clearRepeat = (...a) => clearInterval(...a), writeClipboard = null }) {
  const base = `/v1/browser/${encodeURIComponent(sessionId)}`;
  let state = { phase: 'run', view: 'front', focus: false };
  let source = null;
  let viewer = null;
  let connecting = false;
  let attempts = 0;
  let retry = null;
  let over = false;
  let quality = 'lq';
  let liveSince = 0;
  // While a stream is being let go (the card says "look again" at every change it makes), and after it failed until the next try is due, nothing connects by itself.
  let letting = 0;
  let waiting = false;

  const wanted = () => !over && state.phase === 'run' && (state.focus || state.view === 'front');

  // The tabs (the strip of the focus mode): asked for while the focus mode is open, and after what the person does with them.
  let tabs = [];
  let poll = null;
  const refreshTabs = async () => {
    const answer = await api('POST', `${base}/tabs`, { op: 'list' }).catch(() => null);
    if (!answer?.ok || !Array.isArray(answer.data?.tabs)) return;
    tabs = answer.data.tabs.map((tab) => ({ id: tab.tabId, title: tab.title || '', url: tab.url || '', active: tab.active === true }));
    const front = tabs.find((tab) => tab.active) || tabs[0];
    card.liveState({ tabs: tabs.map(({ id, title, active }) => ({ id, title, active })), url: front?.url || '' });
  };
  const doTab = async (body) => { await api('POST', `${base}/tabs`, body).catch(() => null); await refreshTabs(); };
  const frontTab = () => tabs.find((tab) => tab.active) || tabs[0];
  const stopPolling = () => { if (poll) { clearRepeat(poll); poll = null; } };
  const startPolling = () => { if (!poll) { void refreshTabs(); poll = setRepeat(() => { void refreshTabs(); }, 3000); } };

  const controller = {
    onNewTab: () => doTab({ op: 'new' }),
    onSwitchTab: (id) => doTab({ op: 'activate', tabId: id }),
    onCloseTab: (id) => doTab({ op: 'close', tabId: id }),
    onRefresh: () => doTab({ op: 'reload', tabId: frontTab()?.id }),
    onBack: () => doTab({ op: 'back', tabId: frontTab()?.id }),
    onNavigate: (url) => doTab({ op: 'navigate', url, tabId: frontTab()?.id }),
    onCopyUrl: () => { const text = frontTab()?.url || ''; const write = writeClipboard || (globalThis.navigator?.clipboard?.writeText ? (value) => globalThis.navigator.clipboard.writeText(value) : null); if (text && write) void Promise.resolve(write(text)).catch(() => {}); },
    onTakeOver: async () => {
      const answer = await api('POST', `${base}/control`, { mode: 'user', viewerId: viewer?.viewerId }).catch(() => ({ ok: false }));
      if (!answer.ok) card.liveState({ control: 'model' });
    },
    onGiveBack: () => { void api('POST', `${base}/control`, { mode: 'model' }).catch(() => {}); },
    onRatio: (key) => { void api('POST', `${base}/screen`, { ratio: key }).catch(() => {}); }
  };

  async function release() {
    stopPolling();
    clearTimer(retry); retry = null;
    liveSince = 0;
    const had = viewer;
    const gone = source;
    source = null; viewer = null;
    gone?.destroy();
    if (had) { letting += 1; try { card.setLive(null); } finally { letting -= 1; } }
    if (had) await api('DELETE', `${base}/viewer/${encodeURIComponent(had.viewerId)}`).catch(() => {});
  }

  async function connect() {
    if (connecting || source) return;
    connecting = true;
    let granted = null;
    try {
      const answer = await api('POST', `${base}/viewer`);
      if (answer?.ok && answer.data?.viewerId) granted = answer.data;
    } catch { /* told below */ }
    connecting = false;
    if (!granted) { schedule(); return; }
    if (!wanted()) { void api('DELETE', `${base}/viewer/${encodeURIComponent(granted.viewerId)}`).catch(() => {}); return; }
    try {
      viewer = granted;
      source = createSource({ viewer: granted, document, quality: state.focus ? 'hq' : 'lq', onState: (next, reason) => { log(next, reason || ''); if (next === 'live') liveSince = now(); if (next === 'closed') lost(reason); } });
    } catch {
      viewer = null; source = null;
      void api('DELETE', `${base}/viewer/${encodeURIComponent(granted.viewerId)}`).catch(() => {});
      schedule();
      return;
    }
    quality = state.focus ? 'hq' : 'lq';
    // The views of the card (the card, the focus mode, the glass circle) let their source go when they close; the stream is not theirs to end, so they get a hand that does not end it.
    const real = source;
    const shared = { mount: (el) => real.mount(el), mountLens: (el) => real.mountLens(el), input: real.input, setQuality: (q) => real.setQuality(q), destroy: () => {} };
    card.setLive({ source: shared, controller, readClipboard });
  }

  // The stream ended by itself (the host closed the viewer, the network went): let go, and look again if somebody still wants to see.
  function lost(reason) {
    if (!source) return;
    if (liveSince && now() - liveSince >= STABLE_MS) attempts = 0;
    log('lost', reason || '', `try ${attempts + 1} of ${RETRY_MS.length + 1}`);
    waiting = true;
    void release().then(() => { if (wanted()) schedule(); });
  }
  function schedule() {
    if (!wanted()) return;
    waiting = true;
    if (retry || attempts >= RETRY_MS.length) return;
    retry = setTimer(() => { retry = null; attempts += 1; waiting = false; if (wanted()) void connect(); }, RETRY_MS[attempts]);
  }

  card.watch((next) => {
    state = next;
    if (next.phase !== 'run' && next.phase !== 'queued') over = true;
    if (letting) return;
    if (wanted()) {
      if (waiting) return;
      if (next.focus) startPolling(); else stopPolling();
      if (source) { const wantQuality = next.focus ? 'hq' : 'lq'; if (wantQuality !== quality) { quality = wantQuality; source.setQuality(wantQuality); } }
      else void connect();
    } else {
      waiting = false;
      if (source || viewer || retry) void release();
    }
  });

  return { stop: () => { over = true; return release(); } };
}
