import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';

// How this server looks at another site on a visitor's behalf (its icon, its name): only public sites, with every stop
// of a redirect checked, a small time and size, and nothing sent from the visitor to a third party. Shared by
// site-icon.js and site-info.js; a file whose name starts with an underscore is not a function of its own.

// What the work calls out to; the tests replace them.
export const siteIconDeps = { lookup, fetch: (...args) => fetchPinned(...args) };

export const PAGE_BYTES = 200_000;
export const ICON_BYTES = 150_000;
export const TIMEOUT_MS = 3500;
const MAX_REDIRECTS = 4;

const HOST_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

/** The host as a plain public domain name, or '' (addresses, local names and anything with a port or path are refused). */
export function cleanHost(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || /[\s/?#@\\]/.test(raw) || raw.includes(':')) return '';
  let host = '';
  try {
    host = new URL(`https://${raw}`).hostname;
  } catch {
    return '';
  }
  if (net.isIP(host) || !HOST_PATTERN.test(host)) return '';
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return '';
  return host;
}

const ipv4Private = (parts) => {
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
};

// IPv6 is let through only from the global unicast range (2000::/3), less the parts of it that carry an IPv4 address inside or are not
// on the internet (Teredo and the other protocol ones, documentation, 6to4). Everything else (loopback, local, multicast, and the forms
// with an IPv4 address inside: ::ffff:7f00:1, ::127.0.0.1, 64:ff9b::7f00:1) is refused, whichever way it is written.
const ipv6Public = new net.BlockList();
ipv6Public.addSubnet('2000::', 3, 'ipv6');
const ipv6Refused = new net.BlockList();
ipv6Refused.addSubnet('2001::', 23, 'ipv6');
ipv6Refused.addSubnet('2001:db8::', 32, 'ipv6');
ipv6Refused.addSubnet('2002::', 16, 'ipv6');

/** True for an address that is not on the public internet. */
export function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  if (net.isIPv4(value)) return ipv4Private(value.split('.').map(Number));
  if (!net.isIPv6(value)) return true;
  return !ipv6Public.check(value, 'ipv6') || ipv6Refused.check(value, 'ipv6');
}

/** The addresses of a host, all of them public, or an error: what is connected to is one of these (see fetchPinned). */
const publicAddresses = async (hostname) => {
  if (net.isIP(hostname)) throw new Error('address');
  const found = await siteIconDeps.lookup(hostname, { all: true });
  if (!found.length || found.some((entry) => isPrivateAddress(entry.address))) throw new Error('private');
  return found;
};

const DECODERS = { gzip: () => zlib.createGunzip(), 'x-gzip': () => zlib.createGunzip(), deflate: () => zlib.createInflate(), br: () => zlib.createBrotliDecompress() };

/**
 * A GET to the address that was checked, never to one the name resolves to later: the name is not looked up again (a name that answers a
 * public address to the check and an inside one to the connection is the trick this stops). The name still goes in the Host header and
 * in the TLS server name, so the site and its certificate are the same. Answers like fetch with redirect 'manual'.
 */
export function fetchPinned(url, { pinned, headers = {}, signal } = {}) {
  const target = new URL(url);
  if (!pinned?.address) return Promise.reject(new Error('address'));
  const family = pinned.family || net.isIP(pinned.address);
  const pinnedLookup = (_host, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    if (options?.all) done(null, [{ address: pinned.address, family }]);
    else done(null, pinned.address, family);
  };
  const client = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(target, { method: 'GET', headers, signal, lookup: pinnedLookup, agent: false }, (response) => {
      const decode = DECODERS[String(response.headers['content-encoding'] || '').trim().toLowerCase()];
      const body = decode ? response.pipe(decode()) : response;
      const status = response.statusCode || 502;
      const bodyless = status === 204 || status === 304 || (status >= 300 && status < 400);
      if (bodyless) response.resume();
      const answerHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (name === 'content-encoding' || name === 'content-length') continue;
        for (const one of [].concat(value)) answerHeaders.append(name, String(one));
      }
      resolve(new Response(bodyless ? null : Readable.toWeb(body), { status, headers: answerHeaders }));
    });
    // What was connected to is checked once more: nothing but the checked address is ever spoken to.
    request.on('socket', (socket) => socket.once('connect', () => {
      if (isPrivateAddress(socket.remoteAddress)) request.destroy(new Error('private'));
    }));
    request.on('error', reject);
    request.end();
  });
}

/** One fetch that follows redirects itself, so every stop is checked: a public site cannot send this server inward. */
export async function fetchPublic(url, { accept, maxBytes, signal }) {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(current.protocol) || (current.port && current.port !== '80' && current.port !== '443')) throw new Error('address');
    if (current.username || current.password) throw new Error('address');
    const [pinned] = await publicAddresses(current.hostname);
    const response = await siteIconDeps.fetch(current, {
      pinned,
      redirect: 'manual',
      signal,
      headers: { Accept: accept, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current);
      continue;
    }
    if (!response.ok || !response.body) throw new Error('status');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      chunks.push(value);
      if (size > maxBytes) {
        // A page's icons are in its head: what was read is enough. An icon that is too big is not one.
        await reader.cancel().catch(() => {});
        if (accept.startsWith('image/')) throw new Error('size');
        break;
      }
    }
    return { url: current, bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))) };
  }
  throw new Error('redirects');
}

/** The attributes of one tag, by lower-case name. */
export const attributes = (tag) => {
  const found = {};
  for (const match of tag.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return found;
};

