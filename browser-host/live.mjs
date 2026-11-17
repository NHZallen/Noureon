// The live screen of the browsers (design doc section 6 and 12.2): which port each browser's WebRTC uses, who may look (one temporary member for each person, made and
// removed from here), who points and types (given control, or taken back), the size of the screen, and what the small proxy needs to know to send a viewer to the right
// container. Pure logic: neko comes in as `makeNeko`, the container's address as `containerIp`, time as `now`.
import crypto from 'node:crypto';
import { createNekoApi } from './neko-api.mjs';
import { HostError } from './session-manager.mjs';

export const RATIO_SIZES = Object.freeze({ '4:3': { w: 1024, h: 768 }, '16:9': { w: 1280, h: 720 }, portrait: { w: 768, h: 1024 } });
const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');
const CARD_TICKET_MS = 5 * 60_000;
const CARD_TRIES = 5;
const sameSecret = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// eslint-disable-next-line no-control-regex
const clean = (value, limit) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit) : '');
/** The card as the host takes it: only these fields, each checked; `null` when what is needed (number, expiry, security code, name) is not there. Nothing of it is ever logged or given back. */
export function checkCard(input) {
  const digits = clean(input?.number, 40).replace(/[\s-]/g, '');
  if (!/^[0-9]{12,19}$/.test(digits)) return null;
  const exp = clean(input?.exp, 10).replace(/\s/g, '');
  const match = /^(0?[1-9]|1[0-2])\/?([0-9]{2}|[0-9]{4})$/.exec(exp);
  if (!match) return null;
  const cvc = clean(input?.cvc, 6);
  if (!/^[0-9]{3,4}$/.test(cvc)) return null;
  const name = clean(input?.name, 80);
  if (!name) return null;
  const card = { number: digits, expMonth: match[1].padStart(2, '0'), expYear: match[2].slice(-2), expYear4: match[2].length === 4 ? match[2] : `20${match[2]}`, cvc, name };
  for (const [key, limit] of [['line1', 120], ['line2', 120], ['city', 80], ['state', 60], ['zip', 20], ['country', 60], ['phone', 30], ['email', 120]]) { const value = clean(input?.[key], limit); if (value) card[key] = value; }
  return card;
}

/**
 * config: { publicIp, bindIp?, portBase, slots, host (the name of the viewer's address, e.g. live-staging.noureon.com), maxViewers, viewerWaitMs, viewerGoneMs }
 */
export function createLive({ config, makeNeko = (baseUrl, apiToken) => createNekoApi({ baseUrl, apiToken }), containerIp, squarePixels = null, now = Date.now, log = () => {}, makeSecret = randomHex }) {
  const cfg = { maxViewers: 3, viewerWaitMs: 60_000, viewerGoneMs: 30_000, ...config };
  const used = new Set();
  const byPath = new Map(); // path token -> session

  const need = (s) => { if (!s?.live?.neko) throw new HostError(409, 'not_live', 'the live screen is not ready'); return s.live; };
  const forget = (s, viewer) => s.live.viewers.delete(viewer.memberId);
  // Square pixels for the stream (docker-args.mjs, screenMmArgs). When it cannot be done the browser still works: one line in the log, nothing of the page in it.
  const square = async (s, size, when) => {
    if (!squarePixels) return;
    let result;
    try { result = await squarePixels(s, size); } catch { result = { ok: false, why: 'failed' }; }
    if (!result?.ok) log({ ev: 'screen_mm_warning', sessionId: s.sessionId, when, why: String(result?.why || 'failed').slice(0, 80) });
  };

  return {
    get config() { return cfg; },
    /** Takes a port and the secrets for a browser about to start. */
    allocate(s) {
      let slot = 0;
      while (slot < cfg.slots && used.has(slot)) slot += 1;
      if (slot >= cfg.slots) throw new HostError(503, 'no_live_port', 'no free port for the live screen');
      used.add(slot);
      const live = { slot, udpPort: cfg.portBase + slot, apiToken: makeSecret(24), pathToken: makeSecret(16), publicIp: cfg.publicIp, bindIp: cfg.bindIp ?? cfg.publicIp, viewers: new Map(), neko: null, ip: null, controller: null };
      s.live = live;
      byPath.set(live.pathToken, s);
      return live;
    },
    /** The browser is up: find its address and make sure nobody can control it until given it. */
    async ready(s) {
      if (!s.live) throw new HostError(409, 'not_live', 'no live port was taken');
      s.live.ip = await containerIp(s);
      s.live.neko = makeNeko(`http://${s.live.ip}:8080`, s.live.apiToken);
      await s.live.neko.settings({ locked_controls: true, private_mode: false });
      await square(s, s.screen ?? RATIO_SIZES['4:3'], 'start'); // before anybody watches: the first pipeline is built with square pixels
    },
    release(s) {
      if (!s.live) return;
      used.delete(s.live.slot);
      byPath.delete(s.live.pathToken);
      s.live.cardTicket = null;
      s.live.neko = null;
      s.live.viewers.clear();
    },
    /** For the proxy: where does this path go? (only a browser that is live) */
    target(pathToken) {
      const s = byPath.get(pathToken);
      if (!s?.live?.ip || !s.live.neko) return null;
      return { ip: s.live.ip, port: 8080, sessionId: s.sessionId };
    },
    /** One temporary member for the person who looks; the page gets only the session token and the path of the WebSocket. */
    async createViewer(s) {
      const live = need(s);
      if (live.viewers.size >= cfg.maxViewers) throw new HostError(429, 'too_many_viewers', 'too many people are looking at this browser');
      const username = `v-${makeSecret(6)}`;
      const password = makeSecret(16);
      await live.neko.createMember({ username, password });
      let login;
      try {
        login = await live.neko.login(username, password);
      } catch (error) {
        await live.neko.deleteMember(username).catch(() => {});
        throw error;
      }
      const viewer = { memberId: login.id || username, createdAt: now(), connectedAt: null, goneAt: null };
      live.viewers.set(viewer.memberId, viewer);
      s.lastActionAt = now();
      log({ ev: 'viewer_created', sessionId: s.sessionId });
      return { viewerId: viewer.memberId, token: login.token, host: cfg.host, wsPath: `/s/${live.pathToken}/api/ws`, ratioSizes: RATIO_SIZES };
    },
    async closeViewer(s, viewerId) {
      const live = need(s);
      const viewer = live.viewers.get(viewerId);
      if (!viewer) throw new HostError(404, 'no_viewer', 'no such viewer');
      forget(s, viewer);
      if (live.controller === viewer.memberId) { live.controller = null; await live.neko.reset().catch(() => {}); }
      await live.neko.deleteMember(viewer.memberId).catch(() => {});
      log({ ev: 'viewer_closed', sessionId: s.sessionId });
    },
    /** `mode` 'user': this viewer points and types now; 'model': taken back (the model works with DevTools, the person's input counts for nothing). */
    async control(s, { mode, viewerId }) {
      const live = need(s);
      s.lastActionAt = now();
      if (mode === 'user') {
        if (!live.viewers.has(viewerId)) throw new HostError(404, 'no_viewer', 'no such viewer');
        await live.neko.give(viewerId);
        live.controller = viewerId;
        return { control: 'user' };
      }
      if (mode === 'model') {
        await live.neko.reset();
        live.controller = null;
        return { control: 'model' };
      }
      throw new HostError(400, 'bad_request', 'mode must be user or model');
    },
    /** The size of the virtual screen (the browser window follows, nobody reconnects; the pixels stay square). */
    async setRatio(s, ratio) {
      const live = need(s);
      const size = RATIO_SIZES[ratio];
      if (!size || !Object.prototype.hasOwnProperty.call(RATIO_SIZES, ratio)) throw new HostError(400, 'bad_request', 'unknown ratio');
      // neko keeps the size in millimetres when it changes the pixels (seen on the real host), and a pipeline built after the change works its ratio out from them:
      // so the millimetres for the new size go in first, and once more after (in case something reset them).
      await square(s, size, 'before_ratio');
      await live.neko.setScreen({ width: size.w, height: size.h });
      await square(s, size, 'after_ratio');
      s.screen = { w: size.w, h: size.h };
      s.lastActionAt = now();
      return { ratio, width: size.w, height: size.h };
    },
    /** A one-time permission for the person's page to hand a card straight to this browser (never through the main server): bound to the site the browser is on now. */
    createCardTicket(s, { origin }) {
      const live = need(s);
      if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(String(origin || ''))) throw new HostError(400, 'bad_request', 'the page cannot take a card');
      live.cardTicket = { ticket: makeSecret(24), origin, expiresAt: now() + CARD_TICKET_MS, tries: 0 };
      s.lastActionAt = now();
      return { ticket: live.cardTicket.ticket, host: cfg.host, path: `/s/${live.pathToken}/card`, expiresInMs: CARD_TICKET_MS };
    },
    /**
     * The card arrives from the person's page: { status, body }. The ticket must be the one given, not too old and not tried more than a few times; the card is checked, typed into the
     * page by `run(sessionId, action)`, and only the names of the fields that were filled are answered. The ticket goes when the card is in.
     */
    async fillCard({ pathToken, ticket, card, run }) {
      const s = byPath.get(String(pathToken));
      const held = s?.live?.cardTicket;
      if (!held || !s.live.neko) return { status: 404, body: { error: 'not_found' } };
      if (now() > held.expiresAt || held.tries >= CARD_TRIES) { s.live.cardTicket = null; return { status: 404, body: { error: 'not_found' } }; }
      held.tries += 1;
      if (!sameSecret(ticket, held.ticket)) return { status: 404, body: { error: 'not_found' } };
      const checked = checkCard(card);
      if (!checked) return { status: 400, body: { error: 'bad_card' } };
      try {
        const done = await run(s.sessionId, { type: 'fill-card', origins: [held.origin], card: checked });
        s.lastActionAt = now();
        s.live.cardTicket = null;
        log({ ev: 'card_filled', sessionId: s.sessionId });
        return { status: 200, body: { ok: true, filled: done.filled || [], missing: done.missing || [] } };
      } catch (error) {
        const known = error instanceof HostError && error.status < 500;
        return { status: known ? 409 : 502, body: { error: 'not_filled', message: known ? String(error.message).slice(0, 200) : 'the browser could not take it' } };
      }
    },
    /** Removes viewers who never came, and those who went away and did not return; keeps a browser that is being looked at from counting as idle. */
    async tick(sessions) {
      for (const s of sessions) {
        const live = s.live;
        if (!live?.neko || !live.viewers.size) continue;
        let seen;
        try { seen = new Map((await live.neko.listSessions()).map((entry) => [entry.id, entry.state?.is_connected === true])); } catch { continue; }
        for (const viewer of [...live.viewers.values()]) {
          const connected = seen.get(viewer.memberId) === true;
          if (connected) { viewer.connectedAt ??= now(); viewer.goneAt = null; s.lastActionAt = now(); continue; }
          if (viewer.connectedAt === null && now() - viewer.createdAt > cfg.viewerWaitMs) {
            await this.closeViewer(s, viewer.memberId).catch(() => {});
          } else if (viewer.connectedAt !== null) {
            viewer.goneAt ??= now();
            if (now() - viewer.goneAt > cfg.viewerGoneMs) await this.closeViewer(s, viewer.memberId).catch(() => {});
          }
        }
      }
    }
  };
}
