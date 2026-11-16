// The small door of the live screen (browser-host/live-proxy.mjs): only the WebSocket path of a live browser gets through, with the page's Origin removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createLiveProxy } from '../browser-host/live-proxy.mjs';

const TOKEN = 'a'.repeat(32);
async function start() {
  const seen = [];
  const upstream = net.createServer((sock) => {
    let data = '';
    sock.on('data', (chunk) => { data += chunk.toString('latin1'); if (data.includes('\r\n\r\n') && !sock.answered) { sock.answered = true; seen.push(data); sock.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\nhello'); } });
    sock.on('error', () => {});
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  const upPort = upstream.address().port;
  const live = { target: (t) => (t === TOKEN ? { ip: '127.0.0.1', port: upPort, sessionId: 'session-00000001' } : null) };
  const proxy = createLiveProxy({ live, connect: (port, ip) => net.connect({ host: ip, port }) });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const port = proxy.address().port;
  const raw = (text) => new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(text));
    let out = ''; sock.on('data', (c) => { out += c.toString('latin1'); }); sock.on('close', () => resolve(out));
    setTimeout(() => { sock.destroy(); }, 300);
  });
  const close = () => new Promise((r) => { proxy.closeAllConnections?.(); upstream.close(); proxy.close(r); });
  return { port, seen, raw, close };
}
const ws = (path, extra = '') => `GET ${path} HTTP/1.1\r\nHost: live.example.com\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${extra}\r\n`;

test('a live browser path is handed to neko with the Origin and the host removed and the prefix cut', async () => {
  const t = await start();
  try {
    const out = await t.raw(ws(`/s/${TOKEN}/api/ws?token=abc`, 'Origin: https://staging.noureon.com\r\nCookie: secret=1\r\nX-Forwarded-For: 1.2.3.4\r\n'));
    assert.match(out, /^HTTP\/1\.1 101/); assert.match(out, /hello$/);
    const head = t.seen[0];
    assert.match(head, /^GET \/api\/ws\?token=abc HTTP\/1\.1\r\n/);
    assert.doesNotMatch(head, /origin:/i); assert.doesNotMatch(head, /cookie:/i); assert.doesNotMatch(head, /x-forwarded-for/i);
    assert.match(head, /Sec-WebSocket-Key/i);
  } finally { await t.close(); }
});

test('everything else is 404: wrong token, other paths, plain requests', async () => {
  const t = await start();
  try {
    assert.match(await t.raw(ws(`/s/${'b'.repeat(32)}/api/ws`)), /^HTTP\/1\.1 404/);
    assert.match(await t.raw(ws(`/s/${TOKEN}/api/login`)), /^HTTP\/1\.1 404/);
    assert.match(await t.raw(ws('/')), /^HTTP\/1\.1 404/);
    assert.match(await t.raw(ws(`/s/${TOKEN}/api/ws/extra`)), /^HTTP\/1\.1 404/);
    const plain = await t.raw(`GET /s/${TOKEN}/api/ws HTTP/1.1\r\nHost: x\r\n\r\n`);
    assert.match(plain, /^HTTP\/1\.1 404/);
    assert.equal(t.seen.length, 0);
  } finally { await t.close(); }
});
