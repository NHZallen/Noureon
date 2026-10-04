import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { connect as netConnect, createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createNetProxy, isInternalAddress, normalizeHost, parseTarget } from '../../sandbox-host/runner/net-proxy.js';

test('internal addresses are recognised in every spelling: private ranges, this machine, link-local, mapped IPv6, and what cannot be read', () => {
  for (const address of ['127.0.0.1', '10.42.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a00:1', '64:ff9b::7f00:1', '2002:7f00:1::1', 'not an address', '']) {
    assert.equal(isInternalAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.equal(isInternalAddress(address), false, address);
  // The addresses of the machine's own interfaces (its public one) are as forbidden.
  assert.equal(isInternalAddress('203.0.114.7', new Set(['203.0.114.7'])), true);
});

test('names and targets are put in one form', () => {
  assert.equal(normalizeHost('PyPI.org.'), 'pypi.org');
  assert.equal(normalizeHost('bücher.example'), 'xn--bcher-kva.example');
  assert.equal(normalizeHost('[::1]'), '::1');
  assert.equal(normalizeHost('bad host'), '');
  assert.equal(normalizeHost('a/b'), '');
  assert.deepEqual(parseTarget('Example.com:443'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseTarget('[2001:db8::1]:80'), { host: '2001:db8::1', port: 80 });
  assert.equal(parseTarget('example.com'), null);
  assert.equal(parseTarget('example.com:99999'), null);
});

/** A proxy on a unix socket in a folder of its own, and an HTTP site on a port of this machine to reach through it. */
async function harness({ policy, ask, resolve, isInternal = () => false, own = () => new Set(), connect, withSite = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'noureon-net-'));
  const logs = [];
  const hits = [];
  const site = createHttpServer((request, response) => {
    hits.push({ url: request.url, host: request.headers.host, proxy: request.headers['proxy-connection'] });
    response.end('hello');
  });
  if (withSite) await new Promise((resolveListen) => site.listen(0, '127.0.0.1', resolveListen));
  const port = withSite ? site.address().port : 80;
  const proxy = createNetProxy({
    socketPath: join(dir, 'net', 'p.sock'),
    policy,
    ask,
    log: (event, fields) => logs.push({ event, ...fields }),
    resolve: resolve || (async () => [{ address: '127.0.0.1', family: 4 }]),
    isInternal,
    own,
    connect,
    ports: [port, 443]
  });
  await proxy.listen();
  return {
    proxy, logs, hits, port,
    done: async () => {
      await proxy.close();
      await new Promise((resolveClose) => (withSite ? site.close(resolveClose) : resolveClose()));
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** One HTTP request through the proxy (the proxy form). Resolves { status, body, headers }. */
const through = (socketPath, url) => new Promise((resolveRequest, reject) => {
  const request = httpRequest({ socketPath, method: 'GET', path: url, headers: { Host: new URL(url).host } }, (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => resolveRequest({ status: response.statusCode, body, headers: response.headers }));
  });
  request.on('error', reject);
  request.end();
});

/** A CONNECT through the proxy: resolves { status, socket } (the tunnel when the status is 200). */
const tunnel = (socketPath, target) => new Promise((resolveRequest, reject) => {
  const request = httpRequest({ socketPath, method: 'CONNECT', path: target });
  request.on('connect', (response, socket) => resolveRequest({ status: response.statusCode, headers: response.headers, socket }));
  request.on('response', (response) => { response.resume(); resolveRequest({ status: response.statusCode, headers: response.headers, socket: null }); });
  request.on('error', reject);
  request.end();
});

test('the socket may be used by the container’s user, and a request in the proxy form reaches an allowed site with nothing of the proxy left on it', async () => {
  const h = await harness({ policy: { mode: 'new', rules: { 'example.test': 'allow' } }, ask: async () => { throw new Error('must not be asked'); } });
  try {
    assert.equal(statSync(h.proxy.socketPath).mode & 0o777, 0o666);
    const answer = await through(h.proxy.socketPath, `http://example.test:${h.port}/a/b?c=1`);
    assert.equal(answer.status, 200);
    assert.equal(answer.body, 'hello');
    assert.deepEqual(h.hits, [{ url: '/a/b?c=1', host: `example.test:${h.port}`, proxy: undefined }]);
  } finally {
    await h.done();
  }
});

test('a tunnel (https) to an allowed site carries bytes both ways', async () => {
  const echo = createTcpServer((socket) => { socket.on('data', (chunk) => socket.write(`echo:${chunk}`)); });
  await new Promise((resolveListen) => echo.listen(0, '127.0.0.1', resolveListen));
  const port = echo.address().port;
  const dir = mkdtempSync(join(tmpdir(), 'noureon-net-'));
  const proxy = createNetProxy({ socketPath: join(dir, 'p.sock'), policy: { mode: 'new', rules: { 'secure.test': 'allow' } }, resolve: async () => [{ address: '127.0.0.1', family: 4 }], isInternal: () => false, ports: [port] });
  await proxy.listen();
  try {
    const { status, socket } = await tunnel(proxy.socketPath, `secure.test:${port}`);
    assert.equal(status, 200);
    const reply = await new Promise((resolveData) => { socket.once('data', (chunk) => resolveData(String(chunk))); socket.write('ping'); });
    assert.equal(reply, 'echo:ping');
    socket.destroy();
  } finally {
    await proxy.close();
    echo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an internal address is refused, always: whatever the rules say, whatever the name, and the person is never asked', async () => {
  let asked = 0;
  const names = {
    'inside.test': [{ address: '10.42.0.1', family: 4 }],
    'metadata.test': [{ address: '169.254.169.254', family: 4 }],
    'local.test': [{ address: '::1', family: 6 }],
    'mapped.test': [{ address: '::ffff:127.0.0.1', family: 6 }],
    // A name that answers with a public address and an internal one: refused, the program must not be left to pick.
    'mixed.test': [{ address: '8.8.8.8', family: 4 }, { address: '192.168.1.5', family: 4 }]
  };
  const h = await harness({
    policy: { mode: 'new', rules: { 'inside.test': 'allow', 'metadata.test': 'allow', 'local.test': 'allow', 'mapped.test': 'allow', 'mixed.test': 'allow', '127.0.0.1': 'allow' } },
    ask: async () => { asked += 1; return 'always'; },
    resolve: async (host) => names[host],
    isInternal: isInternalAddress,
    withSite: false
  });
  try {
    for (const name of Object.keys(names)) {
      const answer = await through(h.proxy.socketPath, `http://${name}/`);
      assert.equal(answer.status, 403, name);
      assert.equal(answer.headers['x-noureon-block'], 'internal', name);
      const refused = await tunnel(h.proxy.socketPath, `${name}:443`);
      assert.equal(refused.status, 403, name);
      assert.equal(refused.headers['x-noureon-block'], 'internal', name);
    }
    // An address written out is checked as it is.
    const literal = await tunnel(h.proxy.socketPath, '127.0.0.1:443');
    assert.equal(literal.status, 403);
    // The address of this very machine, found by its interfaces, is refused too (a name pointing at the machine's public address).
    const own = await harness({ policy: { mode: 'new', rules: { 'me.test': 'allow' } }, resolve: async () => [{ address: '203.0.114.7', family: 4 }], isInternal: isInternalAddress, own: () => new Set(['203.0.114.7']), withSite: false });
    try {
      assert.equal((await tunnel(own.proxy.socketPath, 'me.test:443')).status, 403);
    } finally {
      await own.done();
    }
    assert.equal(asked, 0);
    assert.ok(h.logs.some((entry) => entry.event === 'net_blocked' && entry.reason === 'internal'));
  } finally {
    await h.done();
  }
});

test('the connection goes to the address that was checked, not to one the name leads to a second time', async () => {
  const connected = [];
  let lookups = 0;
  const h = await harness({
    policy: { mode: 'new', rules: { 'rebind.test': 'allow' } },
    // The first answer is a public address (checked); a second lookup would give an internal one.
    resolve: async () => { lookups += 1; return lookups === 1 ? [{ address: '8.8.8.8', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]; },
    isInternal: isInternalAddress,
    connect: (options) => { connected.push(options.host); return netConnect({ host: '127.0.0.1', port: 9 }); }
  });
  try {
    const refused = await tunnel(h.proxy.socketPath, 'rebind.test:443');
    assert.equal(refused.status, 502);
    assert.deepEqual(connected, ['8.8.8.8']);
    assert.equal(lookups, 1);
  } finally {
    await h.done();
  }
});

test('a site with no rule is asked about: once lasts the session, always becomes a rule, deny becomes a rule, a missing answer is a refusal and no rule', async () => {
  const questions = [];
  const answers = { 'once.test': 'once', 'always.test': 'always', 'deny.test': 'deny', 'silent.test': 'timeout' };
  const h = await harness({ policy: { mode: 'new', rules: {} }, ask: async (question) => { questions.push(question.host); return answers[question.host]; } });
  try {
    const url = (host) => `http://${host}:${h.port}/`;
    assert.equal((await through(h.proxy.socketPath, url('once.test'))).status, 200);
    assert.equal((await through(h.proxy.socketPath, url('once.test'))).status, 200);
    assert.equal((await through(h.proxy.socketPath, url('always.test'))).status, 200);
    const denied = await through(h.proxy.socketPath, url('deny.test'));
    assert.equal(denied.status, 403);
    assert.equal(denied.headers['x-noureon-block'], 'denied');
    assert.equal((await through(h.proxy.socketPath, url('deny.test'))).status, 403);
    const silent = await through(h.proxy.socketPath, url('silent.test'));
    assert.equal(silent.status, 403);
    assert.equal(silent.headers['x-noureon-block'], 'timeout');
    // Each site was asked about once in this session.
    assert.deepEqual(questions, ['once.test', 'always.test', 'deny.test', 'silent.test']);
    // What the proxy holds as rules after: the person's lasting answers only.
    assert.deepEqual(h.proxy.rules, { 'always.test': 'allow', 'deny.test': 'deny' });
  } finally {
    await h.done();
  }
});

test('connections to the same site that come while the person is being asked wait for the one answer', async () => {
  let release;
  let asked = 0;
  const h = await harness({ policy: { mode: 'new', rules: {} }, ask: () => { asked += 1; return new Promise((resolveAnswer) => { release = resolveAnswer; }); } });
  try {
    const waiting = [1, 2, 3].map(() => through(h.proxy.socketPath, `http://slow.test:${h.port}/`));
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    assert.equal(asked, 1);
    release('once');
    const answers = await Promise.all(waiting);
    assert.deepEqual(answers.map((answer) => answer.status), [200, 200, 200]);
  } finally {
    await h.done();
  }
});

test('"ask for every site" asks once per site and session even when the site is allowed; a refused site is never asked about', async () => {
  const questions = [];
  const h = await harness({ policy: { mode: 'always', rules: { 'ok.test': 'allow', 'no.test': 'deny' } }, ask: async (question) => { questions.push(question.host); return 'once'; } });
  try {
    const url = (host) => `http://${host}:${h.port}/`;
    assert.equal((await through(h.proxy.socketPath, url('ok.test'))).status, 200);
    assert.equal((await through(h.proxy.socketPath, url('ok.test'))).status, 200);
    assert.equal((await through(h.proxy.socketPath, url('no.test'))).status, 403);
    assert.deepEqual(questions, ['ok.test']);
    // The person changes the rules while the sandbox runs.
    h.proxy.setPolicy({ mode: 'new', rules: { 'new.test': 'allow', 'ok.test': 'deny' } });
    assert.equal((await through(h.proxy.socketPath, url('new.test'))).status, 200);
    // What was answered in this session stays (the person said yes to it, for this reply).
    assert.equal((await through(h.proxy.socketPath, url('ok.test'))).status, 200);
  } finally {
    await h.done();
  }
});

test('only the web ports are open, and a name that cannot be found is told so', async () => {
  const h = await harness({ policy: { mode: 'new', rules: { 'example.test': 'allow', 'gone.test': 'allow' } }, resolve: async (host) => { if (host === 'gone.test') throw new Error('ENOTFOUND'); return [{ address: '8.8.8.8', family: 4 }]; } });
  try {
    assert.equal((await tunnel(h.proxy.socketPath, 'example.test:22')).status, 403);
    assert.equal((await tunnel(h.proxy.socketPath, 'example.test:25')).status, 403);
    assert.equal((await tunnel(h.proxy.socketPath, 'gone.test:443')).status, 502);
    assert.equal((await tunnel(h.proxy.socketPath, 'nonsense')).status, 400);
    assert.equal((await through(h.proxy.socketPath, 'ftp://example.test/')).status, 400);
  } finally {
    await h.done();
  }
});

test('closing the proxy ends its connections and removes its socket', async () => {
  const h = await harness({ policy: { mode: 'new', rules: { 'example.test': 'allow' } } });
  const { socket } = await tunnel(h.proxy.socketPath, `example.test:${h.port}`);
  const closed = new Promise((resolveClose) => socket.once('close', resolveClose));
  await h.proxy.close();
  await closed;
  assert.throws(() => statSync(h.proxy.socketPath));
  await h.done().catch(() => {});
});
