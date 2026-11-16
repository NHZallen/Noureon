#!/usr/bin/env node
// Asks the running Chromium what its sandbox is doing: opens chrome://sandbox in a tab of its own and prints the text of the page. A browser that is
// "adequately sandboxed" says so ("You are adequately sandboxed."). This is the check of design doc §10.6 item 7; starting without --no-sandbox only shows
// that Chromium did not refuse to start. Exit code 0 only when the page says the browser is adequately sandboxed.
//
//   node check-sandbox.mjs [devtools=http://127.0.0.1:9222]
// The DevTools port is only reachable from the browser container's own network, so run it like this:
//   docker run --rm --network container:<name> -v "$PWD":/work -w /work node:22-alpine node check-sandbox.mjs
// Needs Node 22 or later (the global WebSocket).
const devtools = process.argv[2] || 'http://127.0.0.1:9222';
if (!globalThis.WebSocket) { console.error('This needs Node 22 or later (global WebSocket).'); process.exit(2); }
const version = await (await fetch(`${devtools}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('Could not open the DevTools socket')), { once: true }); });
let nextId = 1; const waiting = new Map();
socket.addEventListener('message', (event) => { const m = JSON.parse(String(event.data)); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} took more than 20 s`)); }, 20000);
  waiting.set(id, (m) => { clearTimeout(timer); m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); });
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await send('Target.createTarget', { url: 'chrome://sandbox' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
let text = '';
for (let attempt = 0; attempt < 10 && !/sandbox/i.test(text); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const result = await send('Runtime.evaluate', { expression: 'document.body ? document.body.innerText : ""' }, sessionId).catch(() => null);
  text = result?.result?.value || '';
}
await send('Target.closeTarget', { targetId }).catch(() => {});
socket.close();
console.log(text.trim() || '(the page was empty)');
const ok = /adequately sandboxed/i.test(text) && !/not adequately sandboxed/i.test(text);
console.log(ok ? '\nRESULT: sandbox is ON (the page says adequately sandboxed)' : '\nRESULT: sandbox is NOT confirmed');
process.exit(ok ? 0 : 1);
