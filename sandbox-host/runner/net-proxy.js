// The only way out of a sandbox container: a filtering proxy of the runner, one per session, listening on a unix socket in a folder the
// container sees (the container itself has no network at all; a small program inside it relays 127.0.0.1:3128 to the socket).
// What it decides, for each connection a program inside makes (an HTTP request, or a CONNECT tunnel for https):
//   1. The address the name leads to is looked up here, and a name that leads to an internal address (this machine, the pod network, a
//      private range, a link-local address, the addresses of this machine's own interfaces) is refused, always, whatever the rules say.
//      The connection is then made to the address that was checked, so a name that answers differently the second time gains nothing.
//   2. The person's rules for the site (allow, deny), the choice of "ask for every site", and what was answered in this session.
//   3. A site with no rule is asked about (see `ask`): the answer is awaited, up to the time the owner of `ask` gives.
// Only ports 80 and 443 are open. It sees the name of the site and the port, never the address of a page or what is sent.
// docs/superpowers/specs/2026-10-04-cli-store-design.md, §3.2 and §10.

import { chmodSync, mkdirSync, unlinkSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { BlockList, connect as netConnect, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { networkInterfaces } from 'node:os';
import { dirname } from 'node:path';
import { domainToASCII } from 'node:url';

const DEFAULT_PORTS = [80, 443];
const MAX_TUNNELS = 64;
const IDLE_MS = 120_000;
const CONNECT_MS = 15_000;
const HOST_NAME = /^(?=.{1,253}$)[a-z0-9_]([a-z0-9_-]{0,62}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,62}[a-z0-9_])?)*$/;

const internal = new BlockList();
for (const [base, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) internal.addSubnet(base, bits, 'ipv4');
for (const [base, bits] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16]
]) internal.addSubnet(base, bits, 'ipv6');

/** The IPv4 address inside an IPv4-mapped IPv6 address ("::ffff:10.0.0.1" or "::ffff:a00:1"), or the address as it is. */
const unmapped = (address) => {
  const text = String(address || '').toLowerCase();
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(text);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return text;
};

/** Whether an address is one a sandbox may never reach: this machine, a private network, a special range. An address that is not one is refused too. */
export function isInternalAddress(address, extra = new Set()) {
  const plain = unmapped(String(address || '').replace(/^\[|\]$/g, '').replace(/%.*$/, ''));
  const family = isIP(plain);
  if (!family) return true;
  if (extra.has(plain)) return true;
  return internal.check(plain, family === 4 ? 'ipv4' : 'ipv6');
}

/** The addresses of this machine's own interfaces (the machine's public address is as forbidden as 127.0.0.1: services listen there too). */
export function ownAddresses() {
  const found = new Set();
  for (const list of Object.values(networkInterfaces())) for (const entry of list || []) found.add(unmapped(entry.address));
  return found;
}

/** A site name as the rules keep it: lower case, no final dot, punycode. Returns '' for what is not a name or an address. */
export function normalizeHost(value) {
  let host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return '';
  if (isIP(host)) return unmapped(host);
  // The URL parser would cut "a/b" down to "a": what is not a name is refused before it gets there.
  if (/[\s/\\?#@:%*]/.test(host)) return '';
  host = domainToASCII(host);
  return HOST_NAME.test(host) ? host : '';
}

/** "host:port" or "[v6]:port" (what a CONNECT asks for) as { host, port }, or null. */
export function parseTarget(text) {
  const match = /^(?:\[([^\]]+)\]|([^:\[\]]+)):(\d{1,5})$/.exec(String(text || '').trim());
  if (!match) return null;
  const host = normalizeHost(match[1] || match[2]);
  const port = Number(match[3]);
  return host && port > 0 && port < 65536 ? { host, port } : null;
}

/**
 * `ask({ host, port })` resolves what the person answered: 'once', 'always', 'deny' or 'timeout' (it may wait a long time; the proxy does not
 * time it). `policy` is { mode: 'new' | 'always', rules: { host: 'allow' | 'deny' } } and may be replaced with `setPolicy`.
 */
export function createNetProxy({
  socketPath,
  policy: initial = { mode: 'new', rules: {} },
  ask = async () => 'deny',
  log = () => {},
  resolve = (host) => dnsLookup(host, { all: true, verbatim: true }),
  isInternal = isInternalAddress,
  own = ownAddresses,
  connect = netConnect,
  request = httpRequest,
  ports = DEFAULT_PORTS
}) {
  const allowedPorts = new Set(ports);
  let mode = initial.mode === 'always' ? 'always' : 'new';
  let rules = new Map(Object.entries(initial.rules || {}).map(([host, rule]) => [normalizeHost(host), rule]).filter(([host, rule]) => host && (rule === 'allow' || rule === 'deny')));
  // What was answered in this session (the answer "once" lasts to its end), and the questions being asked.
  const answered = new Map();
  const asking = new Map();
  const sockets = new Set();
  let tunnels = 0;
  let closed = false;

  const decide = (host) => {
    if (answered.has(host)) return answered.get(host);
    const rule = rules.get(host);
    if (rule === 'deny') return 'deny';
    if (rule === 'allow' && mode !== 'always') return 'allow';
    return 'ask';
  };

  /** Whether a connection to the site is to be made: { ok: true, address } or { ok: false, status, reason }. */
  async function authorize(host, port) {
    if (!host || !allowedPorts.has(port)) return { ok: false, status: 403, reason: 'port' };
    let addresses;
    if (isIP(host)) addresses = [{ address: host, family: isIP(host) }];
    else {
      try {
        addresses = await resolve(host);
      } catch {
        return { ok: false, status: 502, reason: 'dns' };
      }
    }
    addresses = (Array.isArray(addresses) ? addresses : []).map((entry) => ({ address: unmapped(entry.address), family: entry.family }));
    if (!addresses.length) return { ok: false, status: 502, reason: 'dns' };
    const mine = own();
    // One internal address among them is enough to refuse: the program must not be left to pick the one that works.
    if (addresses.some((entry) => isInternal(entry.address, mine))) {
      log('net_blocked', { host, reason: 'internal' });
      return { ok: false, status: 403, reason: 'internal' };
    }
    let verdict = decide(host);
    if (verdict === 'ask') {
      let question = asking.get(host);
      if (!question) {
        question = Promise.resolve(ask({ host, port })).catch(() => 'deny').finally(() => asking.delete(host));
        asking.set(host, question);
      }
      const answer = await question;
      if (answer === 'once' || answer === 'always') {
        answered.set(host, 'allow');
        if (answer === 'always') rules.set(host, 'allow');
      } else {
        answered.set(host, 'deny');
        if (answer === 'deny') rules.set(host, 'deny');
      }
      verdict = answered.get(host);
      if (verdict === 'deny') {
        log('net_blocked', { host, reason: answer === 'timeout' ? 'timeout' : 'denied' });
        return { ok: false, status: 403, reason: answer === 'timeout' ? 'timeout' : 'denied' };
      }
    } else if (verdict === 'deny') {
      log('net_blocked', { host, reason: 'denied' });
      return { ok: false, status: 403, reason: 'denied' };
    }
    return { ok: true, addresses };
  }

  const REASONS = {
    internal: 'Blocked by Noureon: this address is inside the server and is never reachable',
    denied: 'Blocked by Noureon: the person did not allow this site',
    timeout: 'Blocked by Noureon: the person did not answer in time',
    port: 'Blocked by Noureon: only ports 80 and 443 are open',
    dns: 'Noureon could not find this site'
  };
  const refusal = (verdict) => `${verdict.status} ${REASONS[verdict.reason] || 'Blocked by Noureon'}`;

  /** A connection to the first of the addresses that answers (they were checked above). */
  async function open(addresses, port) {
    let lastError = null;
    for (const entry of addresses) {
      try {
        return await new Promise((resolveSocket, rejectSocket) => {
          const socket = connect({ host: entry.address, port });
          const timer = setTimeout(() => socket.destroy(new Error('timeout')), CONNECT_MS);
          socket.once('connect', () => { clearTimeout(timer); resolveSocket(socket); });
          socket.once('error', (error) => { clearTimeout(timer); rejectSocket(error); });
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('no address');
  }

  // A connection is let go when nothing passes for a while, but not while the person is being asked (that can take minutes).
  const idle = (socket) => socket.setTimeout(IDLE_MS, () => socket.destroy());
  const track = (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  };

  const server = createServer(async (clientRequest, clientResponse) => {
    // A request in the proxy form: GET http://host/path HTTP/1.1 (https goes by CONNECT).
    let target;
    try {
      target = new URL(clientRequest.url);
    } catch {
      clientResponse.writeHead(400).end('Bad request');
      return;
    }
    if (target.protocol !== 'http:') {
      clientResponse.writeHead(400).end('Only http: goes this way; https uses CONNECT.');
      return;
    }
    const host = normalizeHost(target.hostname);
    const port = Number(target.port || 80);
    clientRequest.pause();
    const verdict = closed ? { ok: false, status: 503, reason: 'closed' } : await authorize(host, port);
    if (!verdict.ok) {
      clientResponse.writeHead(verdict.status, { 'X-Noureon-Block': verdict.reason, 'Content-Type': 'text/plain' }).end(REASONS[verdict.reason] || 'Blocked by Noureon');
      clientRequest.resume();
      return;
    }
    if (tunnels >= MAX_TUNNELS) {
      clientResponse.writeHead(503).end('Too many connections');
      clientRequest.resume();
      return;
    }
    tunnels += 1;
    idle(clientRequest.socket);
    const headers = {};
    for (const [name, value] of Object.entries(clientRequest.headers)) {
      if (!/^(proxy-|connection$|keep-alive$|te$|trailer$|upgrade$)/i.test(name)) headers[name] = value;
    }
    headers.connection = 'close';
    let released = false;
    const release = () => { if (!released) { released = true; tunnels -= 1; } };
    const upstream = request({ host: verdict.addresses[0].address, port, method: clientRequest.method, path: `${target.pathname}${target.search}`, headers, agent: false, setHost: false, timeout: IDLE_MS }, (answer) => {
      clientResponse.writeHead(answer.statusCode || 502, answer.headers);
      answer.pipe(clientResponse);
      answer.once('end', release);
    });
    upstream.on('error', () => {
      release();
      if (!clientResponse.headersSent) clientResponse.writeHead(502).end('Bad gateway');
      else clientResponse.destroy();
    });
    upstream.on('timeout', () => upstream.destroy());
    clientResponse.once('close', () => { release(); upstream.destroy(); });
    clientRequest.pipe(upstream);
    clientRequest.resume();
    log('net_request', { host, port });
  });
  server.on('connection', track);

  server.on('connect', async (clientRequest, clientSocket, head) => {
    clientSocket.on('error', () => {});
    const target = parseTarget(clientRequest.url);
    // The program may send more before the answer; it is held until the tunnel is there.
    clientSocket.pause();
    const verdict = !target ? { ok: false, status: 400, reason: 'bad' } : closed ? { ok: false, status: 503, reason: 'closed' } : await authorize(target.host, target.port);
    if (!verdict.ok) {
      clientSocket.end(`HTTP/1.1 ${refusal(verdict)}\r\nX-Noureon-Block: ${verdict.reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
      return;
    }
    if (tunnels >= MAX_TUNNELS) {
      clientSocket.end('HTTP/1.1 503 Too many connections\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    tunnels += 1;
    let upstream;
    try {
      upstream = await open(verdict.addresses, target.port);
    } catch {
      tunnels -= 1;
      clientSocket.end('HTTP/1.1 502 Bad gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    track(upstream);
    idle(upstream);
    idle(clientSocket);
    let bytes = 0;
    upstream.on('data', (chunk) => { bytes += chunk.length; });
    const finish = () => {
      tunnels -= 1;
      log('net_tunnel', { host: target.host, port: target.port, bytes });
    };
    upstream.once('close', finish);
    clientSocket.once('close', () => upstream.destroy());
    upstream.once('close', () => clientSocket.destroy());
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) upstream.write(head);
    clientSocket.pipe(upstream);
    upstream.pipe(clientSocket);
    clientSocket.resume();
  });

  return {
    socketPath,
    /** Starts listening. Resolves when the socket is there (and may be used by the container's user). */
    async listen() {
      mkdirSync(dirname(socketPath), { recursive: true });
      try {
        unlinkSync(socketPath);
      } catch {
        // Not there.
      }
      await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(socketPath, () => { server.off('error', rejectListen); resolveListen(); });
      });
      // The program in the container runs as another user: it may connect, and that is all the socket gives.
      chmodSync(socketPath, 0o666);
    },
    /** The rules of the person: { mode, rules } (what was answered in this session stays). */
    setPolicy(next) {
      mode = next?.mode === 'always' ? 'always' : 'new';
      rules = new Map(Object.entries(next?.rules || {}).map(([host, rule]) => [normalizeHost(host), rule]).filter(([host, rule]) => host && (rule === 'allow' || rule === 'deny')));
    },
    /** What the proxy holds as rules now (what was answered "always" or "deny" in this session is in it). */
    get rules() { return Object.fromEntries(rules); },
    get tunnels() { return tunnels; },
    async close() {
      closed = true;
      for (const socket of [...sockets]) socket.destroy();
      await new Promise((resolveClose) => server.close(() => resolveClose()));
      try {
        unlinkSync(socketPath);
      } catch {
        // Gone.
      }
    }
  };
}
