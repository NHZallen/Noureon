#!/usr/bin/env node
// Experiment: drives the Chromium of the neko container over the Chrome DevTools Protocol, the way the model would, while a person watches the same browser
// in the neko page. It connects to the BROWSER (not to one page), opens a tab of its own, loads the page, then scrolls it every 120 ms for the given number of
// seconds and prints how long each step took. Working through the browser socket and a session is how Playwright and Puppeteer attach too, and it does not depend on which
// tabs happen to be open (the stock image opens extension pages).
//
//   node drive.mjs <url> [seconds=60] [devtools=http://127.0.0.1:9222]
//
// Needs Node 22 or later (the global WebSocket). The DevTools port is only reachable from the container's own network, so run it like this:
//   docker run --rm --network container:neko-spike -v "$PWD":/work -w /work node:22-alpine node drive.mjs https://en.wikipedia.org/wiki/Web_browser 60

const [url = 'https://en.wikipedia.org/wiki/Web_browser', secondsArg = '60', devtools = 'http://127.0.0.1:9222'] = process.argv.slice(2);
const seconds = Math.max(1, Number(secondsArg) || 60);
const WebSocketImpl = globalThis.WebSocket;
if (!WebSocketImpl) {
  console.error('This needs Node 22 or later (global WebSocket).');
  process.exit(2);
}

const version = await (await fetch(`${devtools}/json/version`)).json();
const socket = new WebSocketImpl(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('Could not open the DevTools socket')), { once: true });
});

let nextId = 1;
const waiting = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id && waiting.has(message.id)) {
    waiting.get(message.id)(message);
    waiting.delete(message.id);
  }
});
const send = (method, params = {}, sessionId = undefined, limitMs = 20_000) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} took more than ${limitMs / 1000} s`)); }, limitMs);
  waiting.set(id, (message) => {
    clearTimeout(timer);
    if (message.error) reject(new Error(`${method}: ${message.error.message}`));
    else resolve(message.result);
  });
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const started = Date.now();
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
console.log(`own tab opened and attached: ${Date.now() - started} ms`);
const page = (method, params) => send(method, params, sessionId);
await page('Page.enable');
await page('Page.navigate', { url });
console.log(`navigate ${url}: ${Date.now() - started} ms`);
await send('Target.activateTarget', { targetId });
await new Promise((resolve) => setTimeout(resolve, 4000));

let scrolls = 0;
let slowest = 0;
const end = Date.now() + seconds * 1000;
while (Date.now() < end) {
  const tick = Date.now();
  await page('Runtime.evaluate', { expression: 'window.scrollBy(0, 40); if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 5) window.scrollTo(0, 0);' });
  slowest = Math.max(slowest, Date.now() - tick);
  scrolls += 1;
  await new Promise((resolve) => setTimeout(resolve, 120));
}
console.log(`scrolled ${scrolls} times in ${seconds} s, slowest command ${slowest} ms`);
const title = await page('Runtime.evaluate', { expression: 'document.title' });
console.log(`page title: ${title.result?.value}`);
await send('Target.closeTarget', { targetId }).catch(() => {});
socket.close();
