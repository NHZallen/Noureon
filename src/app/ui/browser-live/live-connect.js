// Joins the card of the browser agent to the real live screen (design sections 6 and 16): asks the server for a temporary viewer, opens neko's stream, hands the picture and the
// person's buttons to the card, and lets everything go again when the task is over. While it runs the stream stays even when the card is a pill, so that a press on the pill opens the focus mode without loading again (the low quality costs about a core and 1.2 Mbps).
//   api(method, path, body) -> { ok, status, data }   (the signed-in request of the page to the server)
// The server's routes: POST /v1/browser/:id/viewer, DELETE /v1/browser/:id/viewer/:viewerId, POST /v1/browser/:id/control, POST /v1/browser/:id/screen.

import { createNekoSource } from './neko-source.js';

const RETRY_MS = [1500, 4000, 10_000];
// While the person holds the browser a lost picture comes back as fast as it can: they are in the middle of typing. The first tries come almost at once, and it then looks every two seconds for as long as they hold it.
const HOLDING_RETRY_MS = [250, 600, 1200];
const HOLDING_STEADY_MS = 2000;
// After those, it keeps looking now and then for as long as the task runs (a phone that was away, a network that dropped and came back), not at once and without end.
const SLOW_RETRY_MS = 15_000;
// A stream that lived this long was a real one: the tries start again after it. A stream that ends within seconds is a failure however often it comes back.
const STABLE_MS = 20_000;
// After the dots came back, a frame that shows them takes this long to arrive.
const FRESH_FRAME_MS = 900;

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
  // The eye of the person (what is typed into a field that holds a secret is shown as typed): known here so that a picture for the model is never taken while it is open.
  let eyeOn = false;

  // While the task runs the stream stays, a pill or a turned card too (low quality): a press on the pill opens the focus mode at once, with the picture there, and nothing is loaded again.
  // It goes when the task is over, is cancelled, or fails.
  const wanted = () => !over && state.phase === 'run';

  // The tabs: only to know which address is in front (the name of the site over the screen); there is no strip of our own, the screen shows the browser's.
  let tabs = [];
  let poll = null;
  const refreshTabs = async () => {
    const answer = await api('POST', `${base}/tabs`, { op: 'list' }).catch(() => null);
    if (!answer?.ok || !Array.isArray(answer.data?.tabs)) return;
    tabs = answer.data.tabs.map((tab) => ({ id: tab.tabId, title: tab.title || '', url: tab.url || '', active: tab.active === true }));
    const front = tabs.find((tab) => tab.active) || tabs[0];
    card.liveState({ url: front?.url || '' });
  };
  const doTab = async (body) => { await api('POST', `${base}/tabs`, body).catch(() => null); await refreshTabs(); };
  const frontTab = () => tabs.find((tab) => tab.active) || tabs[0];
  const stopPolling = () => { if (poll) { clearRepeat(poll); poll = null; } };
  const startPolling = () => { if (!poll) { void refreshTabs(); poll = setRepeat(() => { void refreshTabs(); }, 3000); } };

  const controller = {
    onRefresh: () => doTab({ op: 'reload', tabId: frontTab()?.id }),
    onBack: () => doTab({ op: 'back', tabId: frontTab()?.id }),
    // The picture on the screen goes to the box of the message as an attached file (the page puts it there: noureon:attach-files, app-bootstrap-lifecycle.js); true when there was a picture.
    onScreenshot: async () => {
      // The picture goes to the model: with the eye open it would show what the person typed in a field that holds a secret, so the dots come back first and a new frame is waited for.
      if (eyeOn) {
        await controller.onReveal(false);
        await new Promise((resolve) => { setTimer(resolve, FRESH_FRAME_MS); });
      }
      const blob = await source?.snapshot?.().catch(() => null);
      const view = document.defaultView;
      if (!blob || !view?.File || !view?.CustomEvent) return false;
      const file = new view.File([blob], `browser-${new Date(now()).toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' });
      document.dispatchEvent(new view.CustomEvent('noureon:attach-files', { detail: { files: [file] } }));
      return true;
    },
    onNavigate: (url) => doTab({ op: 'navigate', url, tabId: frontTab()?.id }),
    onCopyUrl: () => { const text = frontTab()?.url || ''; const write = writeClipboard || (globalThis.navigator?.clipboard?.writeText ? (value) => globalThis.navigator.clipboard.writeText(value) : null); if (text && write) void Promise.resolve(write(text)).catch(() => {}); },
    onTakeOver: async () => {
      const answer = await api('POST', `${base}/control`, { mode: 'user', viewerId: viewer?.viewerId }).catch(() => ({ ok: false }));
      if (!answer.ok) card.liveState({ control: 'model' });
    },
    onGiveBack: () => { eyeOn = false; card.liveState({ reveal: false }); void api('POST', `${base}/control`, { mode: 'model' }).catch(() => {}); },
    // The eye: shows what is typed into the fields that hold a secret (the page shows them as dots), only while the person holds the browser; asked of the server, which asks the browser.
    onReveal: async (on) => {
      eyeOn = Boolean(on);
      card.liveState({ reveal: eyeOn });
      const answer = await api('POST', `${base}/reveal`, { on: eyeOn }).catch(() => ({ ok: false }));
      // (the answer of the server is in `data`: { ok, status, data: { ok, on } })
      eyeOn = Boolean(answer?.ok && answer.data?.on);
      card.liveState({ reveal: eyeOn });
    },
    onRatio: (key) => { void api('POST', `${base}/screen`, { ratio: key }).catch(() => {}); }
  };

  // `quick`: the stream was lost, not ended on purpose; the viewer of it is let go of in the background, so that a host that does not answer does not delay the next try.
  async function release({ quick = false, keepCard = false } = {}) {
    stopPolling();
    clearTimer(retry); retry = null;
    liveSince = 0;
    const had = viewer;
    const gone = source;
    source = null; viewer = null;
    gone?.destroy();
    // keepCard: the card keeps its screen (the last picture is on it) and gets the new stream when it comes.
    if (had && !keepCard) { letting += 1; try { card.setLive(null); } finally { letting -= 1; } }
    if (had) {
      // keepCard while the person holds the browser: the server keeps the hold for the new viewer that comes (?reconnect=1).
      const gone = api('DELETE', `${base}/viewer/${encodeURIComponent(had.viewerId)}${keepCard ? '?reconnect=1' : ''}`).catch(() => {});
      if (!quick) await gone;
    }
  }

  async function connect() {
    if (connecting || source) return;
    connecting = true;
    let granted = null;
    try {
      const answer = await api('POST', `${base}/viewer`);
      if (answer?.ok && answer.data?.viewerId) granted = answer.data;
      else log('viewer-refused', String(answer?.status ?? ''), String(answer?.code || answer?.data?.error?.code || ''));
    } catch { log('viewer-failed', 'request'); }
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
    const shared = { mount: (el) => real.mount(el), mountLens: (el) => real.mountLens(el), input: real.input, snapshot: (options) => real.snapshot?.(options) ?? Promise.resolve(null), setQuality: (q) => real.setQuality(q), destroy: () => {} };
    card.setLive({ source: shared, controller, readClipboard });
    // The stream came back while the person holds the browser: the new viewer is given the control (the old one was let go of), so that what they do on the screen reaches the browser again.
    if (card.control === 'user') {
      const answer = await api('POST', `${base}/control`, { mode: 'user', viewerId: granted.viewerId }).catch(() => ({ ok: false }));
      if (!answer?.ok) card.liveState({ control: 'model' });
    }
  }

  // The stream ended by itself (the host closed the viewer, the network went): let go, and look again if somebody still wants to see.
  function lost(reason) {
    if (!source) return;
    if (liveSince && now() - liveSince >= STABLE_MS) attempts = 0;
    log('lost', reason || '', `try ${attempts + 1} of ${RETRY_MS.length + 1}`);
    waiting = true;
    // The person holds the browser: the last picture stays on their screen (the focus mode with it) while the stream comes back, so they are not thrown out and have nothing to take over again.
    if (card.control === 'user' && typeof card.freezePicture === 'function') {
      const grabbed = Promise.resolve(source?.snapshot?.()).catch(() => null);
      const quickly = new Promise((resolve) => { setTimer(() => resolve(null), 400); });
      void Promise.race([grabbed, quickly]).then((blob) => {
        card.freezePicture(blob);
        return release({ quick: true, keepCard: true });
      }).then(() => { if (wanted()) schedule(); });
      return;
    }
    void release({ quick: true }).then(() => { if (wanted()) schedule(); });
  }
  function schedule() {
    if (!wanted()) return;
    waiting = true;
    if (retry) return;
    const holding = card.control === 'user';
    const wait = holding ? (attempts < HOLDING_RETRY_MS.length ? HOLDING_RETRY_MS[attempts] : HOLDING_STEADY_MS) : (attempts < RETRY_MS.length ? RETRY_MS[attempts] : SLOW_RETRY_MS);
    retry = setTimer(() => { retry = null; attempts += 1; waiting = false; if (wanted()) void connect(); }, wait);
  }
  // The page comes back to the front or the network comes back: if there is no picture, look at once (the tries start again).
  const lookNow = () => {
    if (!wanted() || source || connecting) return;
    clearTimer(retry); retry = null;
    attempts = 0; waiting = false;
    void connect();
  };
  // Back in front with a stream that looks alive but does not move (the phone froze it while the page was away): let it go and look again.
  let watchdog = null;
  const checkAlive = () => {
    clearTimer(watchdog); watchdog = null;
    if (!source || !wanted()) return;
    const before = card.playhead?.() ?? -1;
    if (before < 0) return;
    watchdog = setTimer(() => { watchdog = null; if (source && wanted() && (card.playhead?.() ?? -1) === before) lost('stalled'); }, 2500);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') { if (source) checkAlive(); else lookNow(); }
  };
  document.addEventListener?.('visibilitychange', onVisible);
  globalThis.addEventListener?.('online', lookNow);
  const unlisten = () => { clearTimer(watchdog); document.removeEventListener?.('visibilitychange', onVisible); globalThis.removeEventListener?.('online', lookNow); };

  card.watch((next) => {
    state = next;
    if (next.phase !== 'run' && next.phase !== 'queued') { over = true; unlisten(); }
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

  return { stop: () => { over = true; unlisten(); return release(); } };
}
