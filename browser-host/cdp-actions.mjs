#!/usr/bin/env node
// One DevTools action, run in a throw-away container that joins the browser's network (docker-args.mjs sidecarArgs). Prints ONE line of JSON: {"ok":true,...} or
// {"ok":false,"error":"..."}; the exit code is 0 only for ok. Needs Node 22 (global WebSocket). The browser does not need --remote-allow-origins: this client sends no Origin.
//   node cdp-actions.mjs '{"type":"navigate","url":"https://example.com/"}'
//   actions: navigate {url, tabId?}   screenshot {tabId?, format?: "png"|"jpeg", quality?}   text {tabId?, maxChars?}   tabs {op: "list"|"new"|"close"|"activate"|"reload", tabId?, url?}
//   snapshot {tabId?, maxChars?}  the page as a list of things to act on, each with a number (`ref`) that stays good while the page stays the same document
//   click {ref, tabId?}   type {ref, text, submit?, tabId?}   press {key, tabId?}   scroll {direction: "up"|"down"|"left"|"right"|"top"|"bottom", tabId?}   back {tabId?}   wait {ms}
//   clear-site {sites: ["example.com"]}  logs the browser out of those sites: their cookies and what they stored (local storage, caches) are removed; says how many cookies went
//   download {ref? | url?, maxBytes?, tabId?}  does what makes the page send a file (a click on the thing, or the address) and takes the file itself out of the browser: { name, mime, size, base64 }; the file is not kept in the browser
//   fill-card {card: {number, expMonth, expYear, expYear4, cvc, name, line1?, …}, origins: ["https://…"], tabId?}  (also on standard input)  types the card into the fields of the page it can find; says which fields it filled and which it did not find, never a value
//   fill-code {code, origins: ["https://…"], tabId?}  (also on standard input)  types a one-time code into the code field of the page (one box, or one box for each digit); says only how many boxes it filled
//   upload {ref, files: [{name, mime, base64}]}  (body arrives on standard input: `--stdin`)  puts the files into the file field of the page (the element given, or the field it belongs to); at most 5 files and 8 MB together
//   fill-login {username?, password?, origins: ["https://…"], tabId?}  (body arrives on standard input: `--stdin`)  fills the visible login fields of the page, only when the page is of one of `origins`; says which
//   fields it filled, never their values. A password field is never read and never typed into by the other actions (logins go through the password vault, design doc §7).
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

// The browser's own windows (the address bar's drop-down, the tab strip, DevTools…) are also "page" targets; they are not what a person sees as a tab, and the
// policy turns their documents into error pages. Seen on the real machine: pages were opened in the drop-down of the address bar, and the next action looked at another target.
// Real tabs: any web page, about:blank, the new tab page, and the error page of a tab that could not load.
export function isUserPage(info) {
  if (!info || info.type !== 'page') return false;
  const url = String(info.url || '');
  if (/^(chrome-untrusted|devtools|chrome-extension):/.test(url)) return false;
  if (/^chrome:\/\//.test(url)) return /^chrome:\/\/(newtab|new-tab-page)(\/|$)/.test(url);
  return true;
}
const pagesOf = async (cdp) => (await cdp.send('Target.getTargets')).targetInfos.filter(isUserPage);
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

// After an action: a moment for the page to start doing what was asked, then until it has finished loading (at most 10 s), then where it is.
async function settle(cdp, sessionId) {
  await wait(400);
  for (let i = 0; i < 40; i += 1) {
    const state = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sessionId).then((r) => r.result?.value).catch(() => null);
    if (state === 'complete') break;
    await wait(250);
  }
  return describeHere(cdp, sessionId).catch(() => ({}));
}


// ---- The password vault: the login fields of the page, filled with what the server handed over (design doc §7). Nothing that is typed here is ever given back. ----
const FIELD_FINDER = `(() => {
  const visible = (el) => { const box = el.getBoundingClientRect(); const style = getComputedStyle(el); return box.width > 4 && box.height > 4 && style.visibility !== 'hidden' && style.display !== 'none' && !el.disabled && !el.readOnly; };
  const inputs = [...document.querySelectorAll('input')].filter(visible);
  const password = inputs.find((el) => el.type === 'password') || null;
  const textual = (el) => ['text', 'email', 'tel', 'search', ''].includes((el.getAttribute('type') || '').toLowerCase());
  const hinted = (el) => /user|email|login|account|identifier|phone|mail/i.test([el.name, el.id, el.autocomplete, el.getAttribute('aria-label'), el.placeholder].join(' '));
  let user = null;
  const candidates = inputs.filter(textual);
  if (password) {
    const before = candidates.filter((el) => el.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING);
    user = before.filter(hinted).at(-1) || before.at(-1) || null;
  } else {
    user = candidates.find((el) => /username|email/.test(el.autocomplete)) || candidates.find(hinted) || (candidates.length === 1 ? candidates[0] : null);
  }
  return { user, password, origin: location.origin };
})()`;

async function fillLogin(cdp, action, targetId, sessionId) {
  const allowed = Array.isArray(action.origins) ? action.origins.filter((o) => typeof o === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(o)) : [];
  if (!allowed.length) throw new Error('the login does not say which sites it is for');
  const username = typeof action.username === 'string' && action.username.length <= 1024 ? action.username : '';
  const password = typeof action.password === 'string' && action.password.length <= 4096 ? action.password : '';
  if (!username && !password) throw new Error('there is nothing to fill');
  const found = await cdp.send('Runtime.evaluate', { expression: FIELD_FINDER, returnByValue: false }, sessionId);
  if (found.exceptionDetails) throw new Error('the page could not be looked at');
  const props = await cdp.send('Runtime.getProperties', { objectId: found.result.objectId, ownProperties: true }, sessionId);
  const of = (name) => props.result.find((p) => p.name === name)?.value;
  const origin = String(of('origin')?.value || '');
  // The page must be a site of this login at the moment of filling (the server looked before, a page can move after that).
  if (!allowed.includes(origin)) throw new Error('this page is not a site of that login; nothing was filled');
  const filled = [];
  for (const [kind, text, element] of [['username', username, of('user')], ['password', password, of('password')]]) {
    if (!text || !element?.objectId) continue;
    const focused = await cdp.send('Runtime.callFunctionOn', { objectId: element.objectId, functionDeclaration: 'function () { this.scrollIntoView({ block: "center" }); this.focus(); if (typeof this.select === "function") this.select(); return document.activeElement === this; }', returnByValue: true }, sessionId);
    if (focused.result?.value !== true) continue;
    await cdp.send('Input.insertText', { text }, sessionId);
    filled.push(kind);
  }
  if (!filled.length) throw new Error('no login field can be seen on this page');
  return { ok: true, tabId: targetId, origin, filled };
}

// The code of a message or an authenticator app: one box (autocomplete one-time-code, a name like otp or code) or one box for each digit. The code is typed, never given back.
const CODE_FINDER = `(() => {
  const visible = (el) => { const box = el.getBoundingClientRect(); const style = getComputedStyle(el); return box.width > 4 && box.height > 4 && style.visibility !== 'hidden' && style.display !== 'none' && !el.disabled && !el.readOnly; };
  const inputs = [...document.querySelectorAll('input')].filter((el) => visible(el) && !['password', 'checkbox', 'radio', 'hidden', 'submit', 'button'].includes(el.type));
  const hinted = (el) => /one-time-code/.test(el.autocomplete) || /otp|code|token|verification|pin|驗證/i.test([el.name, el.id, el.getAttribute('aria-label'), el.placeholder].join(' '));
  const single = inputs.filter((el) => Number(el.maxLength) === 1);
  if (single.length >= 4 && single.length <= 8) return { boxes: single, origin: location.origin };
  const one = inputs.find(hinted) || null;
  return { boxes: one ? [one] : [], origin: location.origin };
})()`;

async function fillCode(cdp, action, targetId, sessionId) {
  const allowed = Array.isArray(action.origins) ? action.origins.filter((o) => typeof o === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(o)) : [];
  if (!allowed.length) throw new Error('the code does not say which sites it is for');
  const code = typeof action.code === 'string' && /^[0-9]{4,8}$/.test(action.code) ? action.code : '';
  if (!code) throw new Error('there is no code to type');
  const found = await cdp.send('Runtime.evaluate', { expression: CODE_FINDER, returnByValue: false }, sessionId);
  if (found.exceptionDetails) throw new Error('the page could not be looked at');
  const top = await cdp.send('Runtime.getProperties', { objectId: found.result.objectId, ownProperties: true }, sessionId);
  const origin = String(top.result.find((p) => p.name === 'origin')?.value?.value || '');
  if (!allowed.includes(origin)) throw new Error('this page is not a site of that login; nothing was typed');
  const list = top.result.find((p) => p.name === 'boxes')?.value;
  const boxes = list?.objectId ? (await cdp.send('Runtime.getProperties', { objectId: list.objectId, ownProperties: true }, sessionId)).result.filter((p) => /^\d+$/.test(p.name)).map((p) => p.value) : [];
  if (!boxes.length) throw new Error('no code field can be seen on this page');
  const focus = (objectId) => cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: 'function () { this.scrollIntoView({ block: "center" }); this.focus(); if (typeof this.select === "function") this.select(); return document.activeElement === this; }', returnByValue: true }, sessionId);
  if (boxes.length === 1) {
    if ((await focus(boxes[0].objectId)).result?.value !== true) throw new Error('the code field cannot take text');
    await cdp.send('Input.insertText', { text: code }, sessionId);
    return { ok: true, tabId: targetId, origin, boxes: 1 };
  }
  // A box for each digit: each box takes its digit (a page that moves on by itself is not in the way: the box is focused again for the next one).
  for (const [index, digit] of [...code].entries()) {
    const box = boxes[index];
    if (!box) break;
    if ((await focus(box.objectId)).result?.value !== true) throw new Error('a code box cannot take text');
    await cdp.send('Input.insertText', { text: digit }, sessionId);
  }
  return { ok: true, tabId: targetId, origin, boxes: boxes.length };
}

// A card: the fields of the page that take it, found by what the page itself says they are (autocomplete, then name, label and the like). The page may have its card fields in a frame of
// another site (many shops do); those cannot be reached from here, and the answer says which fields were not found so that the person can finish by taking over.
const CARD_FINDER = `(() => {
  const visible = (el) => { const box = el.getBoundingClientRect(); const style = getComputedStyle(el); return box.width > 4 && box.height > 4 && style.visibility !== 'hidden' && style.display !== 'none' && !el.disabled && !el.readOnly; };
  const fields = [...document.querySelectorAll('input, select')].filter(visible);
  const text = (el) => [el.name, el.id, el.autocomplete, el.getAttribute('aria-label'), el.placeholder, el.labels && el.labels[0] && el.labels[0].textContent].join(' ');
  const pick = (autocompletes, pattern, tag) => fields.find((el) => (!tag || el.tagName === tag) && autocompletes.includes(el.autocomplete)) || fields.find((el) => (!tag || el.tagName === tag) && pattern.test(text(el))) || null;
  const found = {
    number: pick(['cc-number'], /card.?number|cardnumber|card no|卡號|numéro de carte|номер карты|número de tarjeta/i),
    exp: pick(['cc-exp'], /expir|exp.?date|mm ?\\/ ?yy|有效期/i),
    expMonth: pick(['cc-exp-month'], /exp.*month|month|有效月/i),
    expYear: pick(['cc-exp-year'], /exp.*year|year|有效年/i),
    cvc: pick(['cc-csc'], /cvc|cvv|csc|security code|安全碼|code de sécurité|код безопасности|código de seguridad/i),
    name: pick(['cc-name'], /name on card|card.?holder|cardholder|持卡人|titulaire|держатель|titular/i),
    line1: pick(['address-line1', 'street-address'], /address.*1|street|addr1|地址/i),
    line2: pick(['address-line2'], /address.*2|apt|suite|addr2/i),
    city: pick(['address-level2'], /city|town|城市|ville|город|ciudad/i),
    state: pick(['address-level1'], /state|province|region|縣|州|省/i),
    zip: pick(['postal-code'], /zip|postal|post.?code|郵遞區號|code postal|индекс|código postal/i),
    country: pick(['country', 'country-name'], /country|國家|pays|страна|país/i),
    phone: pick(['tel'], /phone|tel|電話/i),
    email: pick(['email'], /e-?mail|信箱/i)
  };
  return Object.assign({ origin: location.origin }, found);
})()`;

async function fillCard(cdp, action, targetId, sessionId) {
  const allowed = Array.isArray(action.origins) ? action.origins.filter((o) => typeof o === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(o)) : [];
  if (!allowed.length) throw new Error('the card does not say which site it is for');
  const card = action.card && typeof action.card === 'object' ? action.card : null;
  if (!card || typeof card.number !== 'string' || typeof card.cvc !== 'string') throw new Error('there is no card to type');
  const found = await cdp.send('Runtime.evaluate', { expression: CARD_FINDER, returnByValue: false }, sessionId);
  if (found.exceptionDetails) throw new Error('the page could not be looked at');
  const props = await cdp.send('Runtime.getProperties', { objectId: found.result.objectId, ownProperties: true }, sessionId);
  const of = (name) => props.result.find((p) => p.name === name)?.value;
  const origin = String(of('origin')?.value || '');
  if (!allowed.includes(origin)) throw new Error('this page is not the site the card is for; nothing was typed');
  const values = { number: card.number, exp: `${card.expMonth}/${card.expYear}`, expMonth: card.expMonth, expYear: card.expYear4 || card.expYear, cvc: card.cvc, name: card.name, line1: card.line1, line2: card.line2, city: card.city, state: card.state, zip: card.zip, country: card.country, phone: card.phone, email: card.email };
  const filled = []; const missing = [];
  const required = ['number', 'exp', 'cvc', 'name'];
  for (const [key, value] of Object.entries(values)) {
    const element = of(key);
    if (!value) continue;
    // One of the two ways to give the expiry is enough (a box for both, or one for the month and one for the year).
    if (!element?.objectId) { if (required.includes(key) && !(key === 'exp' && of('expMonth')?.objectId && of('expYear')?.objectId)) missing.push(key); continue; }
    const kind = await cdp.send('Runtime.callFunctionOn', { objectId: element.objectId, functionDeclaration: 'function () { return this.tagName; }', returnByValue: true }, sessionId);
    if (kind.result?.value === 'SELECT') {
      const chosen = await cdp.send('Runtime.callFunctionOn', { objectId: element.objectId, functionDeclaration: 'function (wanted) { const w = String(wanted).toLowerCase(); const o = [...this.options].find((x) => x.value.toLowerCase() === w || x.text.trim().toLowerCase() === w || (w.length <= 2 && x.value.replace(/^0+/, "") === w.replace(/^0+/, ""))); if (!o) return false; this.value = o.value; this.dispatchEvent(new Event("input", { bubbles: true })); this.dispatchEvent(new Event("change", { bubbles: true })); return true; }', arguments: [{ value }], returnByValue: true }, sessionId);
      (chosen.result?.value === true ? filled : missing).push(key);
    } else {
      const focused = await cdp.send('Runtime.callFunctionOn', { objectId: element.objectId, functionDeclaration: 'function () { this.scrollIntoView({ block: "center" }); this.focus(); if (typeof this.select === "function") this.select(); return document.activeElement === this; }', returnByValue: true }, sessionId);
      if (focused.result?.value !== true) { missing.push(key); continue; }
      await cdp.send('Input.insertText', { text: String(value) }, sessionId);
      filled.push(key);
    }
  }
  if (!filled.length) throw new Error('no card field can be seen on this page; the person can take over and type the card');
  return { ok: true, tabId: targetId, origin, filled, missing };
}

// ---- Files: what the page sends as a download is taken out of the browser before it can be saved there, and handed back (design doc §8.2) ----
const MAX_DOWNLOAD = 25 * 1024 * 1024;
const DOWNLOADABLE = /^(application\/(octet-stream|pdf|zip|gzip|x-[\w.+-]+|vnd\.[\w.+-]+|msword|rtf|epub\+zip)|audio\/|video\/|text\/csv|text\/calendar|image\/(vnd|heic|tiff))/i;
const headerOf = (headers, name) => (headers || []).find((h) => h.name.toLowerCase() === name)?.value || '';
const isDownloadResponse = (headers) => /attachment/i.test(headerOf(headers, 'content-disposition')) || DOWNLOADABLE.test(headerOf(headers, 'content-type'));
/** The name of a downloaded file: the one the server says, else the last part of the address; never a path. */
export function downloadName(headers, url) {
  const disposition = headerOf(headers, 'content-disposition');
  let name = '';
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);
  if (star) { try { name = decodeURIComponent(star[1].trim()); } catch { name = star[1]; } }
  if (!name) name = /filename\s*=\s*"?([^";]+)"?/.exec(disposition)?.[1] || '';
  if (!name) { try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || ''); } catch { name = ''; } }
  // eslint-disable-next-line no-control-regex
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return name || 'download';
}

// ---- Putting the person's file into the file field of the page: the file is built in the page from its bytes (no file lives on the machine of the browser), then the field is told it changed ----
const MAX_UPLOAD_FILES = 5;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
async function uploadFiles(cdp, action, targetId, sessionId) {
  const ref = checkRef(action.ref);
  const list = Array.isArray(action.files) ? action.files.slice(0, MAX_UPLOAD_FILES) : [];
  if (!list.length) throw new Error('say which files');
  let total = 0;
  for (const file of list) {
    if (typeof file?.name !== 'string' || !file.name || file.name.length > 255 || /[\\/\u0000-\u001f]/.test(file.name)) throw new Error('a file name is not valid');
    if (typeof file.base64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new Error('a file could not be read');
    total += Math.floor(file.base64.length * 0.75);
  }
  if (total > MAX_UPLOAD_BYTES) throw new Error('the files are larger than the page may be given at once');
  const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: ref }, sessionId).catch(() => { throw new Error('that element is not on the page any more: take a new snapshot'); });
  const declaration = `function (files) {
    var input = this;
    if (!(input instanceof HTMLInputElement && input.type === "file")) {
      input = (this.control && this.control.type === "file" ? this.control : null) || (this.querySelector && this.querySelector('input[type="file"]')) || (this.closest && this.closest('label') && this.closest('label').control) || null;
    }
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return "no_file_field";
    if (files.length > 1 && !input.multiple) return "single_file_only";
    var transfer = new DataTransfer();
    for (var i = 0; i < files.length; i++) {
      var raw = atob(files[i].base64), bytes = new Uint8Array(raw.length);
      for (var j = 0; j < raw.length; j++) bytes[j] = raw.charCodeAt(j);
      transfer.items.add(new File([bytes], files[i].name, { type: files[i].mime || "application/octet-stream" }));
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return "ok:" + input.files.length;
  }`;
  const answer = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: declaration, arguments: [{ value: list.map((file) => ({ name: file.name, mime: typeof file.mime === 'string' ? file.mime.slice(0, 100) : '', base64: file.base64 })) }], returnByValue: true }, sessionId, 45_000);
  const result = String(answer.result?.value || '');
  if (result === 'no_file_field') throw new Error('that element is not a file field: look for the button or field that takes a file');
  if (result === 'single_file_only') throw new Error('that field takes one file only');
  if (!result.startsWith('ok:')) throw new Error('the page did not take the file');
  return { ok: true, tabId: targetId, uploaded: Number(result.slice(3)), ...(await settle(cdp, sessionId)) };
}

async function downloadFile(cdp, action, targetId, sessionId) {
  const limit = Math.min(MAX_DOWNLOAD, Math.max(1024, Math.floor(Number(action.maxBytes)) || MAX_DOWNLOAD));
  if (!action.ref && !action.url) throw new Error('say what to click (ref) or which address (url)');
  const url = action.url ? checkNavigableUrl(action.url) : '';
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Response' }] }, sessionId);
  let found = null;
  let tooLarge = false;
  const seen = new Set();
  const handle = async () => {
    for (const event of cdp.events) {
      if (event.method !== 'Fetch.requestPaused' || event.sessionId !== sessionId || seen.has(event.params.requestId)) continue;
      seen.add(event.params.requestId);
      const { requestId, responseHeaders, request, responseStatusCode } = event.params;
      if (!found && responseStatusCode >= 200 && responseStatusCode < 300 && isDownloadResponse(responseHeaders)) {
        const declared = Number(headerOf(responseHeaders, 'content-length')) || 0;
        if (declared > limit) { tooLarge = true; await cdp.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }, sessionId).catch(() => {}); continue; }
        found = { requestId, headers: responseHeaders, url: request.url };
        continue;
      }
      await cdp.send('Fetch.continueResponse', { requestId }, sessionId).catch(() => cdp.send('Fetch.continueRequest', { requestId }, sessionId).catch(() => {}));
    }
  };
  try {
    if (action.ref) {
      const { x, y } = await centerOf(cdp, sessionId, checkRef(action.ref));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
    } else {
      cdp.send('Page.navigate', { url }, sessionId, 30_000).catch(() => {}); // a download "fails" to navigate
    }
    for (let i = 0; i < 120 && !found && !tooLarge; i += 1) { await handle(); if (!found && !tooLarge) await wait(250); }
    if (tooLarge) throw new Error(`the file is larger than ${Math.round(limit / 1024 / 1024)} MB`);
    if (!found) throw new Error('the page did not send a file');
    const body = await cdp.send('Fetch.getResponseBody', { requestId: found.requestId }, sessionId, 40_000);
    const raw = body.base64Encoded ? Buffer.from(body.body, 'base64') : Buffer.from(body.body, 'utf8');
    await cdp.send('Fetch.failRequest', { requestId: found.requestId, errorReason: 'Aborted' }, sessionId).catch(() => {});
    if (raw.length > limit) throw new Error(`the file is larger than ${Math.round(limit / 1024 / 1024)} MB`);
    return { ok: true, tabId: targetId, name: downloadName(found.headers, found.url), mime: headerOf(found.headers, 'content-type').split(';')[0].trim().toLowerCase() || 'application/octet-stream', size: raw.length, base64: raw.toString('base64') };
  } finally {
    await cdp.send('Fetch.disable', {}, sessionId).catch(() => {});
  }
}

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
  if (action.type === 'fill-login') return fillLogin(cdp, action, targetId, sessionId);
  if (action.type === 'fill-code') return fillCode(cdp, action, targetId, sessionId);
  if (action.type === 'fill-card') return fillCard(cdp, action, targetId, sessionId);
  if (action.type === 'download') return downloadFile(cdp, action, targetId, sessionId);
  if (action.type === 'upload') return uploadFiles(cdp, action, targetId, sessionId);
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

// ---- Logging out of a site (the person logged out or deleted the password on the settings page): what the site keeps in the browser goes, nothing else ----
const SITE_NAME = /^[a-z0-9.-]{1,253}$/;
async function clearSites(cdp, action) {
  const sites = [...new Set((Array.isArray(action.sites) ? action.sites : []).map((site) => String(site).toLowerCase()).filter((site) => SITE_NAME.test(site)))].slice(0, 50);
  if (!sites.length) throw new Error('say which sites');
  const targetId = await pickTab(cdp);
  const sessionId = await attach(cdp, targetId);
  await cdp.send('Network.enable', {}, sessionId);
  const { cookies } = await cdp.send('Network.getAllCookies', {}, sessionId);
  const belongs = (domain) => { const d = String(domain).replace(/^\./, '').toLowerCase(); return sites.some((site) => d === site || d.endsWith(`.${site}`)); };
  let removed = 0;
  for (const cookie of cookies || []) {
    if (!belongs(cookie.domain)) continue;
    await cdp.send('Network.deleteCookies', { name: cookie.name, domain: cookie.domain, path: cookie.path }, sessionId).catch(() => {});
    removed += 1;
  }
  for (const site of sites) {
    for (const scheme of ['https', 'http']) await cdp.send('Storage.clearDataForOrigin', { origin: `${scheme}://${site}`, storageTypes: 'all' }, sessionId).catch(() => {});
  }
  return { ok: true, cookies: removed };
}

export async function runAction(action, devtools = 'http://127.0.0.1:9222') {
  const cdp = await connect(devtools);
  try {
    if (action.type === 'clear-site') return await clearSites(cdp, action);
    if (action.type === 'tabs') {
      if (action.op === 'list') {
        const pages = (await pagesOf(cdp)).slice(0, 12);
        // The tab in front is the one that is visible (a tab that is not in front draws nothing).
        const visible = await Promise.all(pages.map(async (p) => {
          try {
            const session = await attach(cdp, p.targetId);
            const state = await cdp.send('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, session, 5000);
            await cdp.send('Target.detachFromTarget', { sessionId: session }).catch(() => {});
            return state.result?.value === 'visible';
          } catch { return false; }
        }));
        return { ok: true, tabs: pages.map((p, i) => ({ tabId: p.targetId, url: p.url, title: p.title, active: visible[i] })) };
      }
      if (action.op === 'activate') {
        if (!action.tabId) throw new Error('tabId is needed');
        await cdp.send('Target.activateTarget', { targetId: await pickTab(cdp, action.tabId) });
        return { ok: true };
      }
      if (action.op === 'reload') {
        const targetId = await pickTab(cdp, action.tabId);
        const session = await attach(cdp, targetId);
        await cdp.send('Page.enable', {}, session);
        await cdp.send('Page.reload', {}, session);
        return { ok: true, tabId: targetId };
      }
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
      // A tab that is not in front draws no frames, and a picture is a frame.
      await cdp.send('Target.activateTarget', { targetId }).catch(() => {});
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
    if (['snapshot', 'click', 'type', 'press', 'scroll', 'back', 'fill-login', 'fill-code', 'fill-card', 'download', 'upload'].includes(action.type)) {
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
  // Whatever happens, one line of JSON comes out within 50 s (the host gives up at 60 s and then knows nothing).
  const watchdog = new Promise((resolve) => { setTimeout(() => resolve({ ok: false, error: 'the action took more than 50 s' }), 50_000).unref?.(); });
  try {
    // A body with a secret in it (`--stdin`) is never an argument and never quoted in an error: a body that cannot be read is told as "unreadable", nothing more.
    let request;
    if (process.argv[2] === '--stdin') {
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      try { request = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('the action could not be read'); }
    } else request = JSON.parse(process.argv[2] || '{}');
    result = await Promise.race([runAction(request, process.env.DEVTOOLS || 'http://127.0.0.1:9222'), watchdog]);
  } catch (error) { result = { ok: false, error: String(error?.message || error).slice(0, 300) }; }
  // The answer of a screenshot is large; leaving at once cut it off when stdout was a pipe (seen on the real machine: exit 0 and an answer that was not JSON).
  process.exitCode = result.ok ? 0 : 1;
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit());
}
