// The only way out of the browser containers: a small HTTP proxy (CONNECT for https, absolute-form for plain http) that checks every destination.
//
//   - It resolves the name itself and refuses the request when ANY answer is private, reserved or one of this host's own addresses
//     (so a name that points inside, a decimal "2130706433", an IPv6 literal or DNS rebinding cannot get through), then connects to the
//     address it checked, never to the name again.
//   - Only the ports in EGRESS_ALLOW_PORTS (default 80 and 443) are allowed: a browser that can open any port is a port scanner.
//   - The way out can be a SOCKS5 upstream (Cloudflare WARP in proxy mode on this host: EGRESS_UPSTREAM_SOCKS=127.0.0.1:40000) or direct.
//   - The log has the name, the port and the verdict, and nothing else: no path, no query, no headers, no body.
//
// Design: docs/superpowers/specs/2026-11-16-browser-agent-design.md (§10). Runs in a container with --network host (see install.sh), so it can reach
// the WARP proxy on 127.0.0.1 and listen on the bridge address of the browser network.
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns';
import { pathToFileURL } from 'node:url';

// Addresses a browser must never reach (IPv4; IPv6 answers are not used at all).
const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
  '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'
];

const ipToInt = (ip) => ip.split('.').reduce((n, part) => (n * 256) + Number(part), 0);

export function parseCidr(text) {
  const [ip, bits = '32'] = String(text).trim().split('/');
  if (net.isIPv4(ip) !== true) throw new Error(`not an IPv4 address or range: ${text}`);
  const length = Number(bits);
  if (!Number.isInteger(length) || length < 0 || length > 32) throw new Error(`bad prefix length: ${text}`);
  const size = 2 ** (32 - length);
  const start = Math.floor(ipToInt(ip) / size) * size;
  return { start, end: start + size - 1 };
}

export function makeBlockList(extra = []) {
  const ranges = [...BLOCKED_V4, ...extra].map(parseCidr);
  return (ip) => {
    if (!net.isIPv4(ip)) return true;
    const value = ipToInt(ip);
    return ranges.some((range) => value >= range.start && value <= range.end);
  };
}

/** "host:port" (CONNECT) or an absolute URL (plain http) -> { host, port } or null when it is not usable. */
export function parseTarget(text, defaultPort) {
  const value = String(text || '').trim();
  const match = /^(?<host>[^\s/:[\]]+):(?<port>\d{1,5})$/.exec(value);
  if (match) return { host: match.groups.host.toLowerCase(), port: Number(match.groups.port) };
  if (/^[^\s/:[\]]+$/.test(value) && defaultPort) return { host: value.toLowerCase(), port: defaultPort };
  return null; // IPv6 literals ("[::1]:80") and anything odd end here
}

/** A minimal SOCKS5 CONNECT to an IPv4 address (no authentication), as Cloudflare WARP's proxy mode speaks it. */
export function socks5Connect({ proxyHost, proxyPort, ip, port, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxyHost, port: proxyPort });
    let stage = 0;
    let buffer = Buffer.alloc(0);
    const fail = (error) => { socket.destroy(); reject(error instanceof Error ? error : new Error(String(error))); };
    socket.setTimeout(timeoutMs, () => fail(new Error('upstream timeout')));
    socket.once('error', fail);
    socket.once('connect', () => socket.write(Buffer.from([5, 1, 0])));
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 0) {
        if (buffer.length < 2) return;
        if (buffer[0] !== 5 || buffer[1] !== 0) return fail(new Error('upstream refused the greeting'));
        buffer = buffer.subarray(2);
        stage = 1;
        const octets = ip.split('.').map(Number);
        socket.write(Buffer.from([5, 1, 0, 1, ...octets, port >> 8, port & 255]));
      }
      if (stage === 1) {
        if (buffer.length < 10) return;
        if (buffer[0] !== 5 || buffer[1] !== 0) return fail(new Error(`upstream could not connect (code ${buffer[1]})`));
        const rest = buffer.subarray(10);
        socket.off('data', onData);
        socket.pause(); // hold whatever arrives until the caller pipes or reads it (a flowing stream with no listener drops data)
        socket.setTimeout(0);
        socket.off('error', fail);
        if (rest.length) socket.unshift(rest);
        resolve(socket);
      }
    };
    socket.on('data', onData);
  });
}

const lookupAll = (host) => new Promise((resolve, reject) => dns.lookup(host, { all: true, family: 4 }, (error, list) => (error ? reject(error) : resolve(list.map((entry) => entry.address)))));

/**
 * options: bindHost, port, allowPorts [80, 443], extraBlock [cidr…], upstreamSocks 'host:port' | '', maxConnections, log(entry)
 * Test hooks: lookup(host) -> [ip…], connect({ ip, port }) -> Promise<socket>
 */
export function createEgressProxy(options = {}) {
  const allowPorts = new Set((options.allowPorts || [80, 443]).map(Number));
  const isBlocked = makeBlockList(options.extraBlock || []);
  const maxConnections = options.maxConnections || 400;
  const log = options.log || (() => {});
  const lookup = options.lookup || lookupAll;
  const connect = options.connect || (async ({ ip, port }) => {
    if (options.upstreamSocks) {
      const [proxyHost, proxyPort] = options.upstreamSocks.split(':');
      return socks5Connect({ proxyHost, proxyPort: Number(proxyPort), ip, port });
    }
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: ip, port });
      socket.setTimeout(15000, () => { socket.destroy(); reject(new Error('timeout')); });
      socket.once('error', reject);
      socket.once('connect', () => { socket.setTimeout(0); socket.off('error', reject); resolve(socket); });
    });
  });
  let active = 0;

  /** Checks a destination; returns { ip } to connect to, or { deny: reason }. */
  async function check(target) {
    if (!target) return { deny: 'bad target' };
    if (!allowPorts.has(target.port)) return { deny: 'port not allowed' };
    if (net.isIP(target.host)) {
      if (isBlocked(target.host)) return { deny: 'address not allowed' };
      return { ip: target.host };
    }
    let answers;
    try { answers = await lookup(target.host); } catch { return { deny: 'name not found' }; }
    if (!answers.length) return { deny: 'name not found' };
    if (answers.some(isBlocked)) return { deny: 'address not allowed' };
    return { ip: answers[0] };
  }

  const server = http.createServer(async (req, res) => {
    if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    let url;
    try { url = new URL(req.url); } catch { res.writeHead(400); res.end(); return; }
    if (url.protocol !== 'http:') { res.writeHead(400); res.end(); return; }
    const target = { host: url.hostname.toLowerCase(), port: Number(url.port || 80) };
    if (active >= maxConnections) { log({ ev: 'deny', host: target.host, port: target.port, why: 'busy' }); res.writeHead(503); res.end(); return; }
    const verdict = await check(target);
    if (verdict.deny) { log({ ev: 'deny', host: target.host, port: target.port, why: verdict.deny }); res.writeHead(403); res.end(); return; }
    active += 1;
    let released = false;
    const release = () => { if (!released) { released = true; active -= 1; } };
    res.on('close', release);
    try {
      const upstream = await connect({ ip: verdict.ip, port: target.port });
      log({ ev: 'http', host: target.host, port: target.port });
      const headers = { ...req.headers };
      delete headers['proxy-connection']; delete headers['proxy-authorization'];
      const outgoing = http.request({ method: req.method, path: `${url.pathname}${url.search}`, headers, createConnection: () => upstream });
      // A SOCKS upstream hands back a socket that is paused on purpose (see socks5Connect); Node's http client does not wake a socket that was paused by hand, so
      // wake it once the client has attached its listeners (the 'socket' event comes after that). Without this, plain http through WARP never answered.
      outgoing.on('socket', (socket) => socket.resume());
      outgoing.on('response', (incoming) => { res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res); });
      outgoing.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(outgoing);
    } catch {
      log({ ev: 'deny', host: target.host, port: target.port, why: 'connect failed' });
      if (!res.headersSent) res.writeHead(502);
      res.end();
    }
  });

  server.on('connect', async (req, clientSocket, head) => {
    const target = parseTarget(req.url);
    const refuse = (code, why) => { log({ ev: 'deny', host: target?.host || '?', port: target?.port || 0, why }); clientSocket.end(`HTTP/1.1 ${code}\r\n\r\n`); };
    clientSocket.on('error', () => {});
    if (active >= maxConnections) return refuse('503 Service Unavailable', 'busy');
    const verdict = await check(target);
    if (verdict.deny) return refuse('403 Forbidden', verdict.deny);
    active += 1;
    let released = false;
    const release = () => { if (!released) { released = true; active -= 1; } };
    clientSocket.on('close', release);
    try {
      const upstream = await connect({ ip: verdict.ip, port: target.port });
      log({ ev: 'connect', host: target.host, port: target.port });
      upstream.on('error', () => clientSocket.destroy());
      clientSocket.on('close', () => upstream.destroy());
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    } catch {
      release();
      refuse('502 Bad Gateway', 'connect failed');
    }
  });

  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}

// Started from the command line (the container): settings come from the environment.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const server = createEgressProxy({
    allowPorts: (env.EGRESS_ALLOW_PORTS || '80,443').split(',').map((part) => Number(part.trim())).filter(Boolean),
    extraBlock: (env.EGRESS_EXTRA_BLOCK || '').split(',').map((part) => part.trim()).filter(Boolean),
    upstreamSocks: (env.EGRESS_UPSTREAM_SOCKS || '').trim(),
    maxConnections: Number(env.EGRESS_MAX_CONNECTIONS || 400),
    log: (entry) => console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }))
  });
  const bindHost = env.EGRESS_BIND || '0.0.0.0';
  const port = Number(env.EGRESS_PORT || 40001);
  server.listen(port, bindHost, () => console.log(JSON.stringify({ t: new Date().toISOString(), ev: 'listening', bindHost, port, upstream: env.EGRESS_UPSTREAM_SOCKS || 'direct' })));
}
