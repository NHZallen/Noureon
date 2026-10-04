// The programs of the CLI tools (docs/superpowers/specs/2026-10-04-cli-store-design.md): fetched once from where their makers publish
// them, checked against the hash the store lists, and kept here; a sandbox is given a link to the file, never a copy that could be changed.
// The address must be https and on the list of hosts (also after each redirect), the size must be the listed one, the bytes must
// have the listed hash: a file that is anything else is never kept.

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_REDIRECTS = 5;

export class CliCacheError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'CliCacheError';
    this.code = code;
    this.status = status;
  }
}

const hostAllowed = (address, hosts) => {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' && hosts.includes(url.hostname);
  } catch {
    return false;
  }
};

export function createCliCache({ dir, hosts, maxBytes, fetchImpl = fetch, log = () => {} }) {
  const inflight = new Map();

  /** The path of the program with this hash, fetched when it is not here yet. */
  async function ensure({ url, sha256, size }) {
    const hash = String(sha256 || '');
    const length = Number(size);
    if (!SHA256.test(hash)) throw new CliCacheError('bad_request', 'The hash of the program is not valid.');
    if (!Number.isInteger(length) || length < 1 || length > maxBytes) throw new CliCacheError('bad_request', 'The size of the program is not valid.');
    if (!hostAllowed(url, hosts)) throw new CliCacheError('bad_request', 'The program may not be fetched from that address.');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, hash);
    if (existsSync(path) && statSync(path).size === length) return path;
    if (inflight.has(hash)) return inflight.get(hash);
    const work = (async () => {
      const part = join(dir, `${hash}.part-${process.pid}-${Date.now()}`);
      try {
        let address = url;
        let response = null;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
          response = await fetchImpl(address, { redirect: 'manual', headers: { 'User-Agent': 'noureon-sandbox-runner' }, signal: AbortSignal.timeout(300_000) });
          if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            address = new URL(response.headers.get('location'), address).toString();
            if (!hostAllowed(address, hosts)) throw new CliCacheError('bad_request', 'The program was sent on to an address that is not allowed.');
            continue;
          }
          break;
        }
        if (!response?.ok || !response.body) throw new CliCacheError('fetch_failed', `The program could not be fetched (${response?.status || 'no answer'}).`, 502);
        const digest = createHash('sha256');
        let received = 0;
        const check = new Transform({
          transform(chunk, _encoding, done) {
            received += chunk.length;
            if (received > length) return done(new CliCacheError('bad_program', 'The program is larger than listed.', 502));
            digest.update(chunk);
            return done(null, chunk);
          }
        });
        await pipeline(Readable.fromWeb(response.body), check, createWriteStream(part, { mode: 0o755 }));
        if (received !== length || digest.digest('hex') !== hash) throw new CliCacheError('bad_program', 'The program is not the one that was listed (its size or hash differs).', 502);
        chmodSync(part, 0o755);
        renameSync(part, path);
        log('cli_cached', { sha256: hash, size: length });
        return path;
      } finally {
        rmSync(part, { force: true });
        inflight.delete(hash);
      }
    })();
    inflight.set(hash, work);
    return work;
  }

  return { ensure };
}
