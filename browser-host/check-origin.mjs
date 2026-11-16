#!/usr/bin/env node
// Design doc §10.2 row 12: can a PAGE in the browser talk to the browser's own DevTools? A page's WebSocket always carries an Origin header, so this opens the
// DevTools socket twice by hand: once with a foreign Origin (what a page would send), which must be refused, and once without one (what our controller sends),
// which must work. Run in the browser's network, like the other DevTools tools:
//   docker run --rm --network container:<name> -v "$PWD":/app:ro node:22-alpine node /app/check-origin.mjs
// Exit code 0 only if the foreign origin was refused AND the controller's way in works.
import net from 'node:net';

const HOST = process.argv[2] || '127.0.0.1';
const PORT = Number(process.argv[3] || 9222);

function upgrade(path, origin) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(PORT, HOST, () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: ${HOST}:${PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${origin ? `Origin: ${origin}\r\n` : ''}\r\n`);
    });
    let data = ''; const done = () => { socket.destroy(); resolve(data.split('\r\n')[0] || '(no answer)'); };
    socket.on('data', (c) => { data += c; if (data.includes('\r\n')) done(); }); socket.on('error', reject); setTimeout(done, 4000);
  });
}

const version = await (await fetch(`http://${HOST}:${PORT}/json/version`)).json();
const path = new URL(version.webSocketDebuggerUrl).pathname;
const foreign = await upgrade(path, 'https://evil.example');
const own = await upgrade(path, null);
const foreignRefused = !/101/.test(foreign);
const ownWorks = /101/.test(own);
console.log(`a page (Origin https://evil.example): ${foreign}  -> ${foreignRefused ? 'REFUSED, good' : 'ACCEPTED, BAD'}`);
console.log(`the controller (no Origin):           ${own}  -> ${ownWorks ? 'accepted, good' : 'REFUSED, BAD'}`);
process.exit(foreignRefused && ownWorks ? 0 : 1);
