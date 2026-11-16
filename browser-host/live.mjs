// The live screen of the browsers (design doc section 6 and 12.2): which port each browser's WebRTC uses, who may look (one temporary member for each person, made and
// removed from here), who points and types (given control, or taken back), the size of the screen, and what the small proxy needs to know to send a viewer to the right
// container. Pure logic: neko comes in as `makeNeko`, the container's address as `containerIp`, time as `now`.
import crypto from 'node:crypto';
import { createNekoApi } from './neko-api.mjs';
import { HostError } from './session-manager.mjs';

export const RATIO_SIZES = Object.freeze({ '4:3': { w: 1024, h: 768 }, '16:9': { w: 1280, h: 720 }, portrait: { w: 768, h: 1024 } });
const randomHex = (bytes) => crypto.randomBytes(bytes).toString('hex');

/**
 * config: { publicIp, bindIp?, portBase, slots, host (the name of the viewer's address, e.g. live-staging.noureon.com), maxViewers, viewerWaitMs, viewerGoneMs }
 */
export function createLive({ config, makeNeko = (baseUrl, apiToken) => createNekoApi({ baseUrl, apiToken }), containerIp, now = Date.now, log = () => {}, makeSecret = randomHex }) {
  const cfg = { maxViewers: 3, viewerWaitMs: 60_000, viewerGoneMs: 30_000, ...config };
  const used = new Set();
  const byPath = new Map(); // path token -> session

  const need = (s) => { if (!s?.live?.neko) throw new HostError(409, 'not_live', 'the live screen is not ready'); return s.live; };
  const forget = (s, viewer) => s.live.viewers.delete(viewer.memberId);

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
    },
    release(s) {
      if (!s.live) return;
      used.delete(s.live.slot);
      byPath.delete(s.live.pathToken);
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
    /** The size of the virtual screen (the browser window follows, nobody reconnects). */
    async setRatio(s, ratio) {
      const live = need(s);
      const size = RATIO_SIZES[ratio];
      if (!size || !Object.prototype.hasOwnProperty.call(RATIO_SIZES, ratio)) throw new HostError(400, 'bad_request', 'unknown ratio');
      await live.neko.setScreen({ width: size.w, height: size.h });
      s.screen = { w: size.w, h: size.h };
      s.lastActionAt = now();
      return { ratio, width: size.w, height: size.h };
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
