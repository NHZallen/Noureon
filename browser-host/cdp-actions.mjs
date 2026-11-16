#!/usr/bin/env node
// One DevTools action, run in a throw-away container that joins the browser's network (docker-args.mjs sidecarArgs). Prints ONE line of JSON: {"ok":true,...} or
// {"ok":false,"error":"..."}; the exit code is 0 only for ok. Needs Node 22 (global WebSocket). The browser does not need --remote-allow-origins: this client sends no Origin.
//   node cdp-actions.mjs '{"type":"navigate","url":"https://example.com/"}'
//   actions: navigate {url, tabId?}   screenshot {tabId?, format?: "png"|"jpeg", quality?}   text {tabId?, maxChars?}   tabs {op: "list"|"new"|"close", tabId?, url?}
//   snapshot {tabId?, maxChars?}  the page as a list of things to act on, each with a number (`ref`) that stays good while the page stays the same document
//   click {ref, tabId?}   type {ref, text, submit?, tabId?}   press {key, tabId?}   scroll {direction: "up"|"down"|"left"|"right"|"top"|"bottom", tabId?}   back {tabId?}   wait {ms}
//   A password field is never read and never typed into here (logins go through the password vault, design doc §7).
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


// ---- What the page looks like to a model: the accessibility tree reduced to what can be acted on (design doc §4.3) ----
const ACTIONABLE = new Set(['link', 'button', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider', 'spinbutton', 'treeitem', 'textarea']);
const MAX_ELEMENTS = 300;
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'textarea']);
const clip = (value, limit) => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return text.length > limit ? `${text.slice(0, limit)}…` : text; };
const checkRef = (ref) => { if (!Number.isInteger(ref) || ref < 1) throw new Error('ref must be a number from the last snapshot'); return ref; };

/** The elements of an accessibility tree (CDP Accessibility.getFullAXTree `nodes`) that can be acted on, with the words that name them. A password field has no value and is labelled as one. */
export function elementsOfTree(nodes) {
  const out = [];
  for (const node of nodes || []) {
    const role = String(node.role?.value || '');
    if (node.ignored || !node.backendDOMNodeId) continue;
    const props = Object.fromEntries((node.properties || []).map((p) => [p.name, p.value?.value]));
    if (role === 'heading') { out.push({ ref: node.backendDOMNodeId, role: 'heading', level: Number(props.level) || undefined, name: clip(node.name?.value, 160) }); continue; }
    if (!ACTIONABLE.has(role)) continue;
    const element = { ref: node.backendDOMNodeId, role, name: clip(node.name?.value, 160) };
    if (props.protected === true || props.protected === 'true') { element.role = 'password field'; } else if (node.value?.value !== undefined && node.value.value !== '') element.value = clip(node.value.value, 160);
    for (const flag of ['disabled', 'required', 'focused', 'readonly']) if (props[flag] === true) element[flag] = true;
    if (props.checked !== undefined && props.checked !== false) element.checked = props.checked;
    if (props.expanded !== undefined) element.expanded = props.expanded;
    if (props.url) element.href = clip(props.url, 200);
    if (element.name || element.value || element.role === 'password field') out.push(element);
  }
  return out;
}

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' }, Tab: { key: 'Tab', code: 'Tab', vk: 9 }, Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 }, Delete: { key: 'Delete', code: 'Delete', vk: 46 }, ' ': { key: ' ', code: 'Space', vk: 32, text: ' ' },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 }, ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 }, ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 }, ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 }, PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 }, Home: { key: 'Home', code: 'Home', vk: 36 }, End: { key: 'End', code: 'End', vk: 35 }
};
KEYS.Space = KEYS[' '];

async function pressKey(cdp, sessionId, name) {
  const spec = KEYS[name];
  if (!spec) throw new Error(`that key is not supported (${Object.keys(KEYS).filter((k) => k !== ' ').join(', ')})`);
  const base = { key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk };
  await cdp.send('Input.dispatchKeyEvent', { type: spec.text ? 'keyDown' : 'rawKeyDown', ...base, ...(spec.text ? { text: spec.text } : {}) }, sessionId);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, sessionId);
}

async function describeHere(cdp, sessionId) {
  const here = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({ url: location.href, title: document.title })', returnByValue: true }, sessionId);
  return JSON.parse(here.result?.value || '{}');
}

// Where an element is on the screen (after scrolling it into view), as the middle of its first box.
async function centerOf(cdp, sessionId, ref) {
  await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: ref }, sessionId).catch(() => {});
  const { quads } = await cdp.send('DOM.getContentQuads', { backendNodeId: ref }, sessionId).catch(() => ({ quads: [] }));
  const quad = (quads || []).find((q) => q.length === 8);
  if (!quad) throw new Error('that element is not on the page any more or cannot be seen: take a new snapshot');
  return { x: (quad[0] + quad[2] + quad[4] + quad[6]) / 4, y: (quad[1] + quad[3] + quad[5] + quad[7]) / 4 };
}

async function isPasswordField(cdp, sessionId, ref) {
  const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: ref }, sessionId).catch(() => { throw new Error('that element is not on the page any more: take a new snapshot'); });
  const answer = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { return this instanceof HTMLInputElement && this.type === "password"; }', returnByValue: true }, sessionId);
  return { objectId: object.objectId, password: answer.result?.value === true };
}

async function settle(cdp, sessionId) { await wait(400); return describeHere(cdp, sessionId).catch(() => ({})); }

async function pageAction(cdp, action, targetId, sessionId) {
  if (action.type === 'snapshot') {
    await cdp.send('Accessibility.enable', {}, sessionId).catch(() => {});
    const { nodes } = await cdp.send('Accessibility.getFullAXTree', {}, sessionId, 30_000);
    const elements = elementsOfTree(nodes);
    // The accessibility tree gives a password field as a plain text box whose value is one dot for each character (that already tells how long the password is), so the
    // DOM says which ones they are; a text box that cannot be checked is given without its value.
    for (const element of elements.filter((e) => TEXT_ROLES.has(e.role) && e.value !== undefined).slice(0, 80)) {
      const checked = await isPasswordField(cdp, sessionId, element.ref).catch(() => ({ password: true }));
      if (checked.password) { delete element.value; element.role = 'password field'; }
    }
    for (const element of elements.filter((e) => TEXT_ROLES.has(e.role) && e.value !== undefined).slice(80)) delete element.value;
    const limit = Math.min(20_000, Math.max(200, Math.floor(Number(action.maxChars)) || 4000));
    const here = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({ url: location.href, title: document.title, text: document.body ? document.body.innerText : "", scrollY: Math.round(scrollY), height: document.documentElement.scrollHeight, view: innerHeight })', returnByValue: true }, sessionId);
    const page = JSON.parse(here.result?.value || '{}');
    const text = String(page.text || '').replace(/\n{3,}/g, '\n\n');
    return { ok: true, tabId: targetId, url: page.url, title: page.title, scroll: { y: page.scrollY, height: page.height, view: page.view }, elements: elements.slice(0, MAX_ELEMENTS), elementsCut: elements.length > MAX_ELEMENTS, text: text.slice(0, limit), truncated: text.length > limit };
  }
  if (action.type === 'click') {
    const ref = checkRef(action.ref);
    const { x, y } = await centerOf(cdp, sessionId, ref);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
    return { ok: true, tabId: targetId, ...(await settle(cdp, sessionId)) };
  }
  if (action.type === 'type') {
    const ref = checkRef(action.ref);
    if (typeof action.text !== 'string' || action.text.length > 2000) throw new Error('text must be a string of at most 2000 characters');
    const { objectId, password } = await isPasswordField(cdp, sessionId, ref);
    if (password) throw new Error('a password field is filled with the login tool, not typed into');
    const focused = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function () { this.focus(); if (typeof this.select === "function") this.select(); return document.activeElement === this; }', returnByValue: true }, sessionId);
    if (focused.result?.value !== true) throw new Error('that element cannot take text');
    if (action.text) await cdp.send('Input.insertText', { text: action.text }, sessionId); else await pressKey(cdp, sessionId, 'Delete');
    if (action.submit) await pressKey(cdp, sessionId, 'Enter');
    return { ok: true, tabId: targetId, ...(await settle(cdp, sessionId)) };
  }
  if (action.type === 'press') {
    await pressKey(cdp, sessionId, String(action.key));
    return { ok: true, tabId: targetId, ...(await settle(cdp, sessionId)) };
  }
  if (action.type === 'scroll') {
    const SCROLLS = { up: 'scrollBy(0, -innerHeight * 0.8)', down: 'scrollBy(0, innerHeight * 0.8)', left: 'scrollBy(-innerWidth * 0.8, 0)', right: 'scrollBy(innerWidth * 0.8, 0)', top: 'scrollTo(0, 0)', bottom: 'scrollTo(0, document.documentElement.scrollHeight)' };
    const expression = SCROLLS[action.direction];
    if (!expression) throw new Error('direction is up, down, left, right, top or bottom');
    await cdp.send('Runtime.evaluate', { expression }, sessionId);
    await wait(250);
    const here = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({ y: Math.round(scrollY), height: document.documentElement.scrollHeight, view: innerHeight })', returnByValue: true }, sessionId);
    return { ok: true, tabId: targetId, scroll: JSON.parse(here.result?.value || '{}') };
  }
  if (action.type === 'back') {
    const history = await cdp.send('Page.getNavigationHistory', {}, sessionId);
    if (history.currentIndex < 1) throw new Error('there is no page to go back to');
    await cdp.send('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id }, sessionId);
    return { ok: true, tabId: targetId, ...(await settle(cdp, sessionId)) };
  }
  return null;
}

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
    if (action.type === 'text') {
      const targetId = await pickTab(cdp, action.tabId);
      const sessionId = await attach(cdp, targetId);
      const limit = Math.min(20_000, Math.max(100, Math.floor(Number(action.maxChars)) || 8000));
      const here = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({ url: location.href, title: document.title, text: document.body ? document.body.innerText : "" })', returnByValue: true }, sessionId);
      const page = JSON.parse(here.result?.value || '{}');
      const text = String(page.text || '');
      return { ok: true, tabId: targetId, url: page.url, title: page.title, text: text.slice(0, limit), truncated: text.length > limit };
    }
    if (action.type === 'wait') {
      await wait(Math.min(10_000, Math.max(0, Math.floor(Number(action.ms)) || 1000)));
      return { ok: true };
    }
    if (['snapshot', 'click', 'type', 'press', 'scroll', 'back'].includes(action.type)) {
      const targetId = await pickTab(cdp, action.tabId);
      const sessionId = await attach(cdp, targetId);
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('DOM.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      return await pageAction(cdp, action, targetId, sessionId);
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
