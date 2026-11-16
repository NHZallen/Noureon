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

test('the card door: only from an allowed page, only POST with a ticket, small, and the card goes to the filler and nowhere else', async () => {
  const calls = [];
  const live = { target: () => null };
  const proxy = createLiveProxy({ live, allowedOrigins: ['https://staging.noureon.com'], fillCard: async (request) => { calls.push(request); return request.ticket.startsWith('aa') ? { status: 200, body: { ok: true, filled: ['number'], missing: [] } } : { status: 404, body: { error: 'not_found' } }; } });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const path = `/s/${'a'.repeat(32)}/card`;
  const post = (headers, body = '{"number":"4242424242424242"}', url = path) => fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  try {
    const ok = await post({ origin: 'https://staging.noureon.com', authorization: `Bearer ${'aa'.repeat(24)}` });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://staging.noureon.com');
    assert.deepEqual(await ok.json(), { ok: true, filled: ['number'], missing: [] });
    assert.deepEqual(calls[0], { pathToken: 'a'.repeat(32), ticket: 'aa'.repeat(24), card: { number: '4242424242424242' } });
    const pre = await fetch(`${base}${path}`, { method: 'OPTIONS', headers: { origin: 'https://staging.noureon.com', 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
    assert.equal((await post({ origin: 'https://evil.example', authorization: `Bearer ${'aa'.repeat(24)}` })).status, 404, 'a page that is not allowed');
    assert.equal((await post({ authorization: `Bearer ${'aa'.repeat(24)}` })).status, 404, 'no page at all');
    assert.equal((await post({ origin: 'https://staging.noureon.com' })).status, 404, 'no ticket');
    assert.equal((await post({ origin: 'https://staging.noureon.com', authorization: 'Bearer nonsense' })).status, 404);
    assert.equal((await post({ origin: 'https://staging.noureon.com', authorization: `Bearer ${'bb'.repeat(24)}` })).status, 404, 'a wrong ticket is the filler\'s answer');
    assert.equal((await post({ origin: 'https://staging.noureon.com', authorization: `Bearer ${'aa'.repeat(24)}` }, 'x'.repeat(5000))).status, 413);
    assert.equal((await post({ origin: 'https://staging.noureon.com', authorization: `Bearer ${'aa'.repeat(24)}` }, 'not json')).status, 400);
    assert.equal((await fetch(`${base}${path}`, { headers: { origin: 'https://staging.noureon.com' } })).status, 404, 'GET is not a door');
    assert.equal((await post({ origin: 'https://staging.noureon.com', authorization: `Bearer ${'aa'.repeat(24)}` }, '{}', '/s/short/card')).status, 404);
  } finally { await new Promise((resolve) => { proxy.closeAllConnections?.(); proxy.close(resolve); }); }
});

test('without a filler or without allowed pages there is no card door at all', async () => {
  const proxy = createLiveProxy({ live: { target: () => null }, allowedOrigins: [], fillCard: async () => ({ status: 200, body: {} }) });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  try {
    const answer = await fetch(`http://127.0.0.1:${proxy.address().port}/s/${'a'.repeat(32)}/card`, { method: 'POST', headers: { origin: 'https://staging.noureon.com', authorization: `Bearer ${'aa'.repeat(24)}` }, body: '{}' });
    assert.equal(answer.status, 404);
  } finally { await new Promise((resolve) => { proxy.closeAllConnections?.(); proxy.close(resolve); }); }
});
