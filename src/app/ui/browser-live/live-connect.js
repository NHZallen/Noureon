// Joins the card of the browser agent to the real live screen (design sections 6 and 16): asks the server for a temporary viewer, opens neko's stream, hands the picture and the
// person's buttons to the card, and lets everything go again as soon as nobody looks (the card is a pill or turned over, the reply is over). Nothing is streamed that nobody sees.
//   api(method, path, body) -> { ok, status, data }   (the signed-in request of the page to the server)
// The server's routes: POST /v1/browser/:id/viewer, DELETE /v1/browser/:id/viewer/:viewerId, POST /v1/browser/:id/control, POST /v1/browser/:id/screen.

import { createNekoSource } from './neko-source.js';

const RETRY_MS = [1500, 4000, 10_000];

export function connectBrowserLive({ card, sessionId, api, document, createSource = createNekoSource, readClipboard = null, setTimer = (...a) => setTimeout(...a), clearTimer = (...a) => clearTimeout(...a) }) {
  const base = `/v1/browser/${encodeURIComponent(sessionId)}`;
  let state = { phase: 'run', view: 'front', focus: false };
  let source = null;
  let viewer = null;
  let connecting = false;
  let attempts = 0;
  let retry = null;
  let over = false;
  let quality = 'lq';

  const wanted = () => !over && state.phase === 'run' && (state.focus || state.view === 'front');

  const controller = {
    onTakeOver: async () => {
      const answer = await api('POST', `${base}/control`, { mode: 'user', viewerId: viewer?.viewerId }).catch(() => ({ ok: false }));
      if (!answer.ok) card.liveState({ control: 'model' });
    },
    onGiveBack: () => { void api('POST', `${base}/control`, { mode: 'model' }).catch(() => {}); },
    onRatio: (key) => { void api('POST', `${base}/screen`, { ratio: key }).catch(() => {}); }
  };

  async function release() {
    clearTimer(retry); retry = null;
    const had = viewer;
    const gone = source;
    source = null; viewer = null;
    gone?.destroy();
    if (had) card.setLive(null);
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
      source = createSource({ viewer: granted, document, quality: state.focus ? 'hq' : 'lq', onState: (next) => { if (next === 'live') attempts = 0; if (next === 'closed') lost(); } });
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
  function lost() {
    if (!source) return;
    void release().then(() => { if (wanted()) schedule(); });
  }
  function schedule() {
    if (!wanted() || retry || attempts >= RETRY_MS.length) return;
    retry = setTimer(() => { retry = null; attempts += 1; if (wanted()) void connect(); }, RETRY_MS[attempts]);
  }

  card.watch((next) => {
    state = next;
    if (next.phase !== 'run' && next.phase !== 'queued') over = true;
    if (wanted()) {
      if (source) { const wantQuality = next.focus ? 'hq' : 'lq'; if (wantQuality !== quality) { quality = wantQuality; source.setQuality(wantQuality); } }
      else void connect();
    } else if (source || viewer || retry) {
      void release();
    }
  });

  return { stop: () => { over = true; return release(); } };
}
