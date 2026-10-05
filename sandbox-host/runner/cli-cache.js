// The programs of the CLI tools (docs/superpowers/specs/2026-10-04-cli-store-design.md): fetched once from where their makers publish
// them, checked against the hash the store lists, and kept here; a sandbox is given a link to the file, never a copy that could be changed.
// The address must be https and on the list of hosts (also after each redirect), the size must be the listed one, the bytes must
// have the listed hash: a file that is anything else is never kept.

import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { extractTarMember } from './tar-member.js';

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_REDIRECTS = 5;
const MEMBER = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

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

export function createCliCache({ dir, hosts, maxBytes, maxUnpackedBytes = 400 * 1024 * 1024, fetchImpl = fetch, log = () => {} }) {
  const inflight = new Map();

  /**
   * The path of the program with this hash, fetched when it is not here yet. `sha256` and `size` are those of the download. When the download is
   * an archive, `archive` = { format: 'tar.gz', member, size } names the one file in it that is the program (`size` there is its size once
   * unpacked): the archive is checked as a whole, then only that file is kept, under the archive's hash.
   */
  async function ensure({ url, sha256, size, archive = null }) {
    const hash = String(sha256 || '');
    const length = Number(size);
    if (!SHA256.test(hash)) throw new CliCacheError('bad_request', 'The hash of the program is not valid.');
    if (!Number.isInteger(length) || length < 1 || length > maxBytes) throw new CliCacheError('bad_request', 'The size of the program is not valid.');
    if (!hostAllowed(url, hosts)) throw new CliCacheError('bad_request', 'The program may not be fetched from that address.');
    if (archive && (archive.format !== 'tar.gz' || !MEMBER.test(String(archive.member || '')) || String(archive.member).includes('..') || !Number.isInteger(archive.size) || archive.size < 1 || archive.size > maxUnpackedBytes)) {
      throw new CliCacheError('bad_request', 'The archive of the program is not described correctly.');
    }
    // What is kept is the program itself: the whole download, or the file taken out of the archive.
    const keptSize = archive ? archive.size : length;
    mkdirSync(dir, { recursive: true });
    const path = join(dir, hash);
    if (existsSync(path) && statSync(path).size === keptSize) return path;
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
        let unpacked = 0;
        if (archive) {
          // The archive is unpacked as it arrives: only the named file is written, and what the archive holds is counted, not trusted.
          try {
            let inflated = 0;
            const bounded = new Transform({
              transform(chunk, _encoding, done) {
                inflated += chunk.length;
                return inflated > maxUnpackedBytes ? done(new CliCacheError('bad_program', 'The archive of the program is larger than allowed once unpacked.', 502)) : done(null, chunk);
              }
            });
            await pipeline(Readable.fromWeb(response.body), check, createGunzip(), bounded, async (source) => {
              const result = await extractTarMember(source, archive.member, createWriteStream(part, { mode: 0o755 }), { maxBytes: archive.size });
              if (!result.found) throw new CliCacheError('bad_program', 'The program is not in the archive that was listed.', 502);
              unpacked = result.bytes;
            });
          } catch (error) {
            if (error instanceof CliCacheError) throw error;
            throw new CliCacheError('bad_program', `The archive of the program could not be opened (${String(error?.message || error).slice(0, 120)}).`, 502);
          }
        } else {
          await pipeline(Readable.fromWeb(response.body), check, createWriteStream(part, { mode: 0o755 }));
          unpacked = received;
        }
        if (received !== length || digest.digest('hex') !== hash || unpacked !== keptSize) throw new CliCacheError('bad_program', 'The program is not the one that was listed (its size or hash differs).', 502);
        chmodSync(part, 0o755);
        renameSync(part, path);
        log('cli_cached', { sha256: hash, size: keptSize });
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
