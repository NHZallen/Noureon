// Who may talk to browser-host: signed requests from the main server, from an allowed address only. Design doc §4.2 and the contract note on NOU-204.
//
// A request carries three headers:
//   X-Noureon-Time       milliseconds since 1970 when it was signed
//   X-Noureon-Nonce      16 random bytes in hex, used once
//   X-Noureon-Signature  hex HMAC-SHA256(secret, METHOD "\n" PATH?QUERY "\n" TIME "\n" NONCE "\n" sha256hex(BODY))
// The check, in this order: the address (403), the headers and their shape (401), the time (401), the signature against every secret in the list (401, so a
// secret can be rotated by listing the new one next to the old one), and only then the nonce (401 if it was seen in the last few minutes). A nonce is
// remembered only after the signature is right, so a stranger cannot fill the memory with made-up ones. Nothing here touches Docker or the network.
import crypto from 'node:crypto';
import net from 'node:net';
import { parseCidr } from './egress-proxy.mjs';

export const HEADER_TIME = 'x-noureon-time';
export const HEADER_NONCE = 'x-noureon-nonce';
export const HEADER_SIGNATURE = 'x-noureon-signature';
export const MIN_SECRET_LENGTH = 32;

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const toBuffer = (body) => (body === undefined || body === null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8'));
const ipToInt = (ip) => ip.split('.').reduce((n, part) => (n * 256) + Number(part), 0);

/** The text that is signed. `pathWithQuery` is exactly what the HTTP request line carries ("/v1/sessions?x=1"). */
export function canonicalString({ method, pathWithQuery, time, nonce, body }) {
  return `${String(method).toUpperCase()}\n${pathWithQuery}\n${time}\n${nonce}\n${sha256Hex(toBuffer(body))}`;
}

/** The three headers for a request (used by the main server and by the tests). */
export function signRequest({ secret, method, pathWithQuery, body, time = Date.now(), nonce = crypto.randomBytes(16).toString('hex') }) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) throw new Error(`the secret must be at least ${MIN_SECRET_LENGTH} characters`);
  const signature = crypto.createHmac('sha256', secret).update(canonicalString({ method, pathWithQuery, time, nonce, body })).digest('hex');
  return { [HEADER_TIME]: String(time), [HEADER_NONCE]: nonce, [HEADER_SIGNATURE]: signature };
}

/** "::ffff:1.2.3.4" -> "1.2.3.4"; anything that is not IPv4 -> null. */
export function normalizeAddress(address) {
  const text = String(address || '').trim();
  const plain = text.startsWith('::ffff:') ? text.slice(7) : text;
  return net.isIPv4(plain) ? plain : null;
}

/**
 * options: secrets [string…] (at least one, each 32+ characters), allowedIps ['1.2.3.4', '10.0.0.0/8'…] (empty = nobody, unless allowAnyIp),
 * allowAnyIp (tests and a closed network only), windowMs 60000, nonceTtlMs 300000, maxNonces 20000, now() -> ms
 */
export function createVerifier({ secrets, allowedIps = [], allowAnyIp = false, windowMs = 60_000, nonceTtlMs = 300_000, maxNonces = 20_000, now = Date.now } = {}) {
  const list = (Array.isArray(secrets) ? secrets : []).map((s) => String(s).trim()).filter(Boolean);
  if (!list.length) throw new Error('at least one secret is needed');
  for (const secret of list) if (secret.length < MIN_SECRET_LENGTH) throw new Error(`every secret must be at least ${MIN_SECRET_LENGTH} characters`);
  const ranges = allowedIps.map((entry) => parseCidr(entry));
  const seen = new Map(); // nonce -> time it may be forgotten

  const addressAllowed = (remoteAddress) => {
    if (allowAnyIp) return true;
    const ip = normalizeAddress(remoteAddress);
    if (!ip) return false;
    const value = ipToInt(ip);
    return ranges.some((range) => value >= range.start && value <= range.end);
  };
  const prune = (at) => { for (const [nonce, until] of seen) if (until <= at) seen.delete(nonce); };

  /** `headers` as Node gives them (lower-case names). Returns { ok: true } or { ok: false, status, reason }. */
  function verify({ method, pathWithQuery, headers = {}, body, remoteAddress }) {
    const fail = (status, reason) => ({ ok: false, status, reason });
    if (!addressAllowed(remoteAddress)) return fail(403, 'address not allowed');
    const time = String(headers[HEADER_TIME] ?? '');
    const nonce = String(headers[HEADER_NONCE] ?? '');
    const signature = String(headers[HEADER_SIGNATURE] ?? '');
    if (!time || !nonce || !signature) return fail(401, 'missing signature headers');
    if (!/^\d{10,16}$/.test(time) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) return fail(401, 'malformed signature headers');
    const at = now();
    if (Math.abs(at - Number(time)) > windowMs) return fail(401, 'request is too old or too new');
    const given = Buffer.from(signature, 'hex');
    const text = canonicalString({ method, pathWithQuery, time, nonce, body });
    let matched = false;
    for (const secret of list) {
      const expected = crypto.createHmac('sha256', secret).update(text).digest();
      if (crypto.timingSafeEqual(given, expected)) matched = true; // no early exit: every secret is always tried
    }
    if (!matched) return fail(401, 'bad signature');
    prune(at);
    if (seen.has(nonce)) return fail(401, 'request was already used');
    if (seen.size >= maxNonces) return fail(429, 'too many requests');
    seen.set(nonce, at + nonceTtlMs);
    return { ok: true };
  }
  return { verify, get remembered() { return seen.size; } };
}
