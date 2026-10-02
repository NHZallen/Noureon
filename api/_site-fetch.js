import { lookup } from 'node:dns/promises';
import net from 'node:net';

// How this server looks at another site on a visitor's behalf (its icon, its name): only public sites, with every stop
// of a redirect checked, a small time and size, and nothing sent from the visitor to a third party. Shared by
// site-icon.js and site-info.js; a file whose name starts with an underscore is not a function of its own.

// What the work calls out to; the tests replace them.
export const siteIconDeps = { lookup, fetch: (...args) => fetch(...args) };

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
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19));
};

/** True for an address that is not on the public internet. */
export function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  if (net.isIPv4(value)) return ipv4Private(value.split('.').map(Number));
  if (!net.isIPv6(value)) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1].split('.').map(Number));
  if (value === '::' || value === '::1') return true;
  return /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith('ff');
}

const assertPublicHost = async (hostname) => {
  if (net.isIP(hostname)) throw new Error('address');
  const found = await siteIconDeps.lookup(hostname, { all: true });
  if (!found.length || found.some((entry) => isPrivateAddress(entry.address))) throw new Error('private');
};

/** One fetch that follows redirects itself, so every stop is checked: a public site cannot send this server inward. */
export async function fetchPublic(url, { accept, maxBytes, signal }) {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(current.protocol) || (current.port && current.port !== '80' && current.port !== '443')) throw new Error('address');
    if (current.username || current.password) throw new Error('address');
    await assertPublicHost(current.hostname);
    const response = await siteIconDeps.fetch(current, {
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

