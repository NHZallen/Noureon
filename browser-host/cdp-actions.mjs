#!/usr/bin/env node
// One DevTools action, run in a throw-away container that joins the browser's network (docker-args.mjs sidecarArgs). Prints ONE line of JSON: {"ok":true,...} or
// {"ok":false,"error":"..."}; the exit code is 0 only for ok. Needs Node 22 (global WebSocket). The browser does not need --remote-allow-origins: this client sends no Origin.
//   node cdp-actions.mjs '{"type":"navigate","url":"https://example.com/"}'
//   actions: navigate {url, tabId?}   screenshot {tabId?, format?: "png"|"jpeg", quality?}   tabs {op: "list"|"new"|"close", tabId?, url?}
import { pathToFileURL } from 'node:url';

const MAX_URL = 4096;
/** Only web pages may be opened. Not chrome://, file://, javascript:, data:, blob:, view-source:, devtools:, extension pages, or addresses with a password in them. */
export function checkNavigableUrl(text, { allowBlank = false } = {}) {
  if (typeof text !== 'string' || !text || text.length > MAX_URL) throw new Error('bad url');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(text.trim()) ) throw new Error('bad url');
  if (allowBlank && text === 'about:blank') return text;
  let url;
  try { url = new URL(text.trim()); } catch { throw new Error('bad url'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('only http and https pages may be opened');
  if (!url.hostname) throw new Error('bad url');
  if (url.username || url.password) throw new Error('an address with a user name or password in it is not allowed');
  return url.href;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(devtools) {
  const version = await (await fetch(`${devtools}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('could not open the DevTools socket')), { once: true }); });
  let nextId = 1; const waiting = new Map(); const events = [];
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(String(event.data));
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } else if (m.method) events.push(m);
  });
  const send = (method, params = {}, sessionId, limitMs = 20_000) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} took more than ${limitMs / 1000} s`)); }, limitMs);
    waiting.set(id, (m) => { clearTimeout(timer); m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { send, events, close: () => socket.close() };
}

const pagesOf = async (cdp) => (await cdp.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page');
async function pickTab(cdp, tabId) {
  const pages = await pagesOf(cdp);
  if (tabId) { const found = pages.find((p) => p.targetId === tabId); if (!found) throw new Error('no such tab'); return found.targetId; }
  if (pages.length) return pages[0].targetId;
  return (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
}
async function attach(cdp, targetId) { return (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId; }

export async function runAction(action, devtools = 'http://127.0.0.1:9222') {
  const cdp = await connect(devtools);
  try {
    if (action.type === 'tabs') {
      if (action.op === 'list') return { ok: true, tabs: (await pagesOf(cdp)).map((p) => ({ tabId: p.targetId, url: p.url, title: p.title })) };
      if (action.op === 'new') {
        const { targetId } = await cdp.send('Target.createTarget', { url: action.url ? checkNavigableUrl(action.url, { allowBlank: true }) : 'about:blank' });
        return { ok: true, tabId: targetId };
      }
      if (action.op === 'close') {
        if (!action.tabId) throw new Error('tabId is needed');
        await pickTab(cdp, action.tabId); // checks that it is a tab of this browser
        await cdp.send('Target.closeTarget', { targetId: action.tabId });
        return { ok: true };
      }
      throw new Error('unknown tabs operation');
    }
    if (action.type === 'navigate') {
      const url = checkNavigableUrl(action.url);
      const targetId = await pickTab(cdp, action.tabId);
      const sessionId = await attach(cdp, targetId);
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Target.activateTarget', { targetId });
      const nav = await cdp.send('Page.navigate', { url }, sessionId);
      if (nav.errorText) throw new Error(`could not open the page: ${nav.errorText}`);
      for (let i = 0; i < 60; i += 1) { // up to 15 s for the load event
        if (cdp.events.some((e) => e.method === 'Page.loadEventFired' && e.sessionId === sessionId)) break;
        await wait(250);
      }
      const here = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({ url: location.href, title: document.title })', returnByValue: true }, sessionId);
      return { ok: true, tabId: targetId, ...JSON.parse(here.result?.value || '{}') };
    }
    if (action.type === 'screenshot') {
      const targetId = await pickTab(cdp, action.tabId);
      const sessionId = await attach(cdp, targetId);
      const format = action.format === 'jpeg' ? 'jpeg' : 'png';
      const shot = await cdp.send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: Math.min(95, Math.max(30, Number(action.quality) || 70)) } : {}) }, sessionId, 30_000);
      return { ok: true, tabId: targetId, mime: `image/${format}`, base64: shot.data };
    }
    throw new Error('unknown action');
  } finally { cdp.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try { result = await runAction(JSON.parse(process.argv[2] || '{}'), process.env.DEVTOOLS || 'http://127.0.0.1:9222'); } catch (error) { result = { ok: false, error: String(error?.message || error).slice(0, 300) }; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}
