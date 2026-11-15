#!/usr/bin/env node
// Experiment: drives the Chromium of the neko container over the Chrome DevTools Protocol, the way the model would, while a person watches the same browser
// in the neko page. It opens a page, then scrolls it every 120 ms for the given number of seconds, and prints how long each step took.
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

const targets = await (await fetch(`${devtools}/json`)).json();
const page = targets.find((target) => target.type === 'page');
if (!page) {
  console.error('No page target found at', devtools);
  process.exit(1);
}

const socket = new WebSocketImpl(page.webSocketDebuggerUrl);
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
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => reject(new Error(`${method} took more than 20 s`)), 20_000);
  waiting.set(id, (message) => {
    clearTimeout(timer);
    if (message.error) reject(new Error(`${method}: ${message.error.message}`));
    else resolve(message.result);
  });
  socket.send(JSON.stringify({ id, method, params }));
});

const started = Date.now();
await send('Page.enable');
await send('Page.navigate', { url });
console.log(`navigate ${url}: ${Date.now() - started} ms`);
await new Promise((resolve) => setTimeout(resolve, 4000));

let scrolls = 0;
let slowest = 0;
const end = Date.now() + seconds * 1000;
while (Date.now() < end) {
  const tick = Date.now();
  await send('Runtime.evaluate', { expression: 'window.scrollBy(0, 40); if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 5) window.scrollTo(0, 0);' });
  slowest = Math.max(slowest, Date.now() - tick);
  scrolls += 1;
  await new Promise((resolve) => setTimeout(resolve, 120));
}
console.log(`scrolled ${scrolls} times in ${seconds} s, slowest command ${slowest} ms`);
const title = await send('Runtime.evaluate', { expression: 'document.title' });
console.log(`page title: ${title.result?.value}`);
socket.close();
