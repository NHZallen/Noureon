// The egress proxy of the browser host (browser-host/egress-proxy.mjs): what it refuses and what it lets through.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createEgressProxy, makeBlockList, parseTarget, parseCidr } from '../browser-host/egress-proxy.mjs';

test('blocked addresses: private, reserved, metadata, loopback, multicast, and the extra list', () => {
  const blocked = makeBlockList(['203.0.114.7/32']);
  for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '203.0.114.7', '::1', 'fe80::1']) {
    assert.equal(blocked(ip), true, ip);
  }
  for (const ip of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255', '203.0.114.8']) {
    assert.equal(blocked(ip), false, ip);
  }
});

test('parseTarget and parseCidr', () => {
  assert.deepEqual(parseTarget('Example.com:443'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseTarget('example.com', 80), { host: 'example.com', port: 80 });
  assert.equal(parseTarget('[::1]:80'), null);
  assert.equal(parseTarget('a b:80'), null);
  assert.equal(parseTarget(''), null);
  assert.deepEqual(parseCidr('10.0.0.0/8'), { start: 167772160, end: 184549375 });
  assert.throws(() => parseCidr('not-an-ip'));
});

// A tiny echo server stands in for "the internet"; the proxy is told every public name lives there.
async function setup({ answers = ['93.184.216.34'], options = {} } = {}) {
  const echo = net.createServer((socket) => socket.on('data', (chunk) => socket.write(chunk)));
  await new Promise((resolve) => echo.listen(0, '127.0.0.1', resolve));
  const web = http.createServer((req, res) => { res.setHeader('x-seen-host', req.headers.host || ''); res.end(`hello ${req.url}`); });
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve));
  const logs = [];
  const connectedTo = [];
  const proxy = createEgressProxy({
    log: (entry) => logs.push(entry),
    lookup: async (host) => (typeof answers === 'function' ? answers(host) : answers),
    connect: async ({ ip, port }) => {
      connectedTo.push(`${ip}:${port}`);
      const target = port === 80 ? web.address().port : echo.address().port;
      return net.connect({ host: '127.0.0.1', port: target });
    },
    ...options
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const close = async () => { for (const server of [proxy, echo, web]) { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); } };
  return { proxy, port: proxy.address().port, logs, connectedTo, close };
}

const connectRequest = (port, target) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port });
  let text = '';
  socket.on('connect', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
  socket.on('data', (chunk) => { text += chunk.toString(); if (text.includes('\r\n\r\n')) resolve({ socket, status: text.split(' ')[1], text }); });
  socket.on('error', () => resolve({ socket, status: 'error', text }));
});

test('CONNECT to a public name goes through and bytes flow both ways', async () => {
  const t = await setup();
  const { socket, status } = await connectRequest(t.port, 'example.com:443');
  assert.equal(status, '200');
  const echoed = await new Promise((resolve) => { socket.once('data', (chunk) => resolve(chunk.toString())); socket.write('ping'); });
  assert.equal(echoed, 'ping');
  assert.deepEqual(t.connectedTo, ['93.184.216.34:443']);
  assert.deepEqual(t.logs.at(-1), { ev: 'connect', host: 'example.com', port: 443 });
  socket.destroy(); await t.close();
});

test('refused: a name that points inside, a mixed answer, literals, other ports', async () => {
  const cases = [
    ['inside.example:443', ['169.254.169.254'], 'address not allowed'],
    ['mixed.example:443', ['93.184.216.34', '10.0.0.5'], 'address not allowed'],
    ['127.0.0.1:443', ['93.184.216.34'], 'address not allowed'],
    ['10.0.0.1:80', ['93.184.216.34'], 'address not allowed'],
    ['2130706433:80', ['127.0.0.1'], 'address not allowed'],
    ['example.com:25', ['93.184.216.34'], 'port not allowed'],
    ['example.com:22', ['93.184.216.34'], 'port not allowed'],
    ['[::1]:443', ['93.184.216.34'], 'bad target']
  ];
  for (const [target, answers, why] of cases) {
    const t = await setup({ answers });
    const { status, socket } = await connectRequest(t.port, target);
    assert.equal(status, '403', target);
    assert.equal(t.connectedTo.length, 0, `${target} must not connect`);
    assert.equal(t.logs.at(-1).why, why, target);
    socket.destroy(); await t.close();
  }
});

test('a name that does not exist is refused', async () => {
  const t = await setup({ options: { lookup: async () => { throw new Error('ENOTFOUND'); } } });
  const { status, socket } = await connectRequest(t.port, 'nothing.example:443');
  assert.equal(status, '403');
  socket.destroy(); await t.close();
});

test('plain http in absolute form goes through; the proxy health check answers', async () => {
  const t = await setup();
  const body = await new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: t.port, method: 'GET', path: 'http://example.com/a?b=1', headers: { host: 'example.com' } }, (response) => {
      let text = ''; response.on('data', (chunk) => { text += chunk; }); response.on('end', () => resolve({ status: response.statusCode, text }));
    });
    request.on('error', reject); request.end();
  });
  assert.equal(body.status, 200);
  assert.equal(body.text, 'hello /a?b=1');
  const health = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: t.port, path: '/healthz' }, (response) => resolve(response.statusCode)));
  assert.equal(health, 200);
  assert.ok(!JSON.stringify(t.logs).includes('b=1'), 'the log must not hold the query');
  await t.close();
});

test('plain http to an inside address is refused with 403', async () => {
  const t = await setup({ answers: ['10.0.0.9'] });
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: t.port, method: 'GET', path: 'http://intranet.example/', headers: { host: 'intranet.example' } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(status, 403);
  assert.equal(t.connectedTo.length, 0);
  await t.close();
});

test('the connection limit answers 503', async () => {
  const t = await setup({ options: { maxConnections: 1 } });
  const first = await connectRequest(t.port, 'example.com:443');
  assert.equal(first.status, '200');
  const second = await connectRequest(t.port, 'example.com:443');
  assert.equal(second.status, '503');
  first.socket.destroy(); second.socket.destroy(); await t.close();
});

test('the SOCKS5 client speaks the greeting and the CONNECT request, and hands over the rest', async () => {
  const seen = [];
  const fake = net.createServer((socket) => {
    let stage = 0;
    socket.on('data', (chunk) => {
      if (stage === 0) { seen.push([...chunk]); stage = 1; socket.write(Buffer.from([5, 0])); return; }
      if (stage === 1) { seen.push([...chunk]); stage = 2; socket.write(Buffer.concat([Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]), Buffer.from('early')])); return; }
      socket.write(chunk);
    });
  });
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
  const { socks5Connect } = await import('../browser-host/egress-proxy.mjs');
  const socket = await socks5Connect({ proxyHost: '127.0.0.1', proxyPort: fake.address().port, ip: '93.184.216.34', port: 443 });
  assert.deepEqual(seen[0], [5, 1, 0]);
  assert.deepEqual(seen[1], [5, 1, 0, 1, 93, 184, 216, 34, 1, 187]);
  const early = await new Promise((resolve) => { socket.once('data', (chunk) => resolve(chunk.toString())); socket.resume(); });
  assert.equal(early, 'early');
  socket.destroy(); fake.close();
});

test('the SOCKS5 client reports a refusal from the upstream', async () => {
  const fake = net.createServer((socket) => {
    let stage = 0;
    socket.on('data', () => {
      if (stage === 0) { stage = 1; socket.write(Buffer.from([5, 0])); return; }
      socket.write(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])); // connection refused
    });
  });
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
  const { socks5Connect } = await import('../browser-host/egress-proxy.mjs');
  await assert.rejects(socks5Connect({ proxyHost: '127.0.0.1', proxyPort: fake.address().port, ip: '93.184.216.34', port: 443 }), /code 5/);
  fake.close();
});

// Cloudflare WARP's proxy mode is a SOCKS5 upstream. Plain http used to hang through it: the SOCKS socket is paused (so no bytes are lost between the handshake and
// the first reader), and Node's http client does not wake a socket that was paused on purpose. (Found on the production machine; https was fine because CONNECT pipes.)
async function socksUpstreamToWeb() {
  const web = http.createServer((req, res) => res.end(`via socks ${req.url}`));
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve));
  const seen = [];
  const socks = net.createServer((client) => {
    let stage = 0; let buf = Buffer.alloc(0);
    client.on('data', (chunk) => {
      if (stage === 2) return;
      buf = Buffer.concat([buf, chunk]);
      if (stage === 0 && buf.length >= 3) { client.write(Buffer.from([5, 0])); buf = buf.subarray(3); stage = 1; }
      if (stage === 1 && buf.length >= 10) {
        seen.push(`${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}:${(buf[8] << 8) | buf[9]}`);
        stage = 2;
        const rest = buf.subarray(10);
        const back = net.connect({ host: '127.0.0.1', port: web.address().port }, () => {
          client.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          if (rest.length) back.write(rest);
          client.pipe(back); back.pipe(client);
        });
        back.on('error', () => client.destroy()); client.on('error', () => back.destroy());
      }
    });
  });
  await new Promise((resolve) => socks.listen(0, '127.0.0.1', resolve));
  const close = async () => { for (const server of [socks, web]) { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); } };
  return { port: socks.address().port, seen, close };
}

test('plain http works through a SOCKS5 upstream (WARP), not only https', async () => {
  const up = await socksUpstreamToWeb();
  const proxy = createEgressProxy({ log: () => {}, lookup: async () => ['93.184.216.34'], upstreamSocks: `127.0.0.1:${up.port}` });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  try {
    const result = await new Promise((resolve) => {
      const request = http.request({ host: '127.0.0.1', port: proxy.address().port, method: 'GET', path: 'http://example.com/x', headers: { host: 'example.com' } }, (response) => {
        let text = ''; response.on('data', (chunk) => { text += chunk; }); response.on('end', () => resolve({ status: response.statusCode, text }));
      });
      const giveUp = setTimeout(() => { request.destroy(); resolve({ status: 0, text: 'timeout' }); }, 3000);
      request.on('error', () => { clearTimeout(giveUp); resolve({ status: 0, text: 'error' }); });
      request.end();
    });
    assert.deepEqual(result, { status: 200, text: 'via socks /x' });
    assert.deepEqual(up.seen, ['93.184.216.34:80']);
  } finally {
    proxy.closeAllConnections?.(); await new Promise((resolve) => proxy.close(resolve)); await up.close();
  }
});
