// Takes one named file out of a tar stream (the stream of an unpacked .tar.gz) and writes it to `sink`, and nothing else: every other entry is
// read past and dropped, so nothing the archive says can put a file anywhere. Used by the CLI cache for the tools whose official download is an
// archive (Pandoc). The bytes written are counted and stopped at `maxBytes`, whatever the archive claims.

import { once } from 'node:events';

const BLOCK = 512;

const text = (buffer, from, to) => {
  const end = buffer.indexOf(0, from);
  return buffer.toString('utf8', from, end === -1 || end > to ? to : end);
};

/** A number field of a tar header: octal text, or (a very large file) base-256 with the high bit set. */
function number(buffer, from, to) {
  if (buffer[from] & 0x80) {
    let value = buffer[from] & 0x7f;
    for (let index = from + 1; index < to; index += 1) value = value * 256 + buffer[index];
    return value;
  }
  const value = parseInt(text(buffer, from, to).trim() || '0', 8);
  return Number.isFinite(value) ? value : NaN;
}

function checksumOk(header) {
  let sum = 0;
  for (let index = 0; index < BLOCK; index += 1) sum += index >= 148 && index < 156 ? 32 : header[index];
  return sum === number(header, 148, 156);
}

/** The `path` of a pax extended header ("27 path=a/very/long/name\n" records), or ''. */
function paxPath(data) {
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(32, at);
    if (space === -1) break;
    const length = Number(data.toString('utf8', at, space));
    if (!Number.isInteger(length) || length <= space - at + 1 || at + length > data.length) break;
    const record = data.toString('utf8', space + 1, at + length - 1);
    if (record.startsWith('path=')) return record.slice(5);
    at += length;
  }
  return '';
}

/**
 * Reads the tar stream `source` (an async iterable of Buffers) to its end and writes the content of the regular file `member` to `sink`
 * (a writable that is ended here). Resolves { found, bytes }. Rejects on a damaged archive or when the file is larger than `maxBytes`.
 */
export async function extractTarMember(source, member, sink, { maxBytes }) {
  let header = Buffer.alloc(0);
  let remaining = 0;
  let padding = 0;
  let entryPadding = 0;
  let purpose = 'skip';
  let collected = [];
  let collectedBytes = 0;
  let pendingName = '';
  let found = false;
  let bytes = 0;

  const finishEntry = () => {
    if (purpose === 'longname') pendingName = Buffer.concat(collected).toString('utf8').replace(/\0.*$/s, '');
    else if (purpose === 'pax') pendingName = paxPath(Buffer.concat(collected)) || pendingName;
    collected = [];
    collectedBytes = 0;
    purpose = 'skip';
    padding = entryPadding;
  };

  try {
    for await (let chunk of source) {
      while (chunk.length) {
        if (remaining > 0) {
          const take = Math.min(remaining, chunk.length);
          const part = chunk.subarray(0, take);
          if (purpose === 'file') {
            bytes += take;
            if (bytes > maxBytes) throw new Error('The file in the archive is larger than allowed.');
            if (!sink.write(part)) await once(sink, 'drain');
          } else if (purpose === 'longname' || purpose === 'pax') {
            collectedBytes += take;
            if (collectedBytes > 65_536) throw new Error('A header of the archive is too long.');
            collected.push(Buffer.from(part));
          }
          remaining -= take;
          chunk = chunk.subarray(take);
          if (remaining === 0) finishEntry();
          continue;
        }
        if (padding > 0) {
          const take = Math.min(padding, chunk.length);
          padding -= take;
          chunk = chunk.subarray(take);
          continue;
        }
        const take = Math.min(BLOCK - header.length, chunk.length);
        header = Buffer.concat([header, chunk.subarray(0, take)]);
        chunk = chunk.subarray(take);
        if (header.length < BLOCK) continue;
        const block = header;
        header = Buffer.alloc(0);
        // An empty block is the end of the archive (or its padding): nothing more to read.
        if (block.every((byte) => byte === 0)) continue;
        if (!checksumOk(block)) throw new Error('The archive is damaged (a header does not add up).');
        const size = number(block, 124, 136);
        if (!Number.isFinite(size) || size < 0) throw new Error('The archive is damaged (a size is not a number).');
        const type = String.fromCharCode(block[156] || 48);
        const ustar = text(block, 257, 263) === 'ustar';
        const own = text(block, 0, 100);
        const prefix = ustar ? text(block, 345, 500) : '';
        const name = pendingName || (prefix ? `${prefix}/${own}` : own);
        entryPadding = (BLOCK - (size % BLOCK)) % BLOCK;
        remaining = size;
        if (type === 'L') purpose = 'longname';
        else if (type === 'x') purpose = 'pax';
        else if (type === 'g') purpose = 'skip';
        else {
          pendingName = '';
          purpose = (type === '0' && name === member && !found) ? 'file' : 'skip';
          if (purpose === 'file') found = true;
        }
        if (remaining === 0) finishEntry();
      }
    }
  } catch (error) {
    sink.destroy();
    throw error;
  }
  sink.end();
  await once(sink, 'finish');
  return { found, bytes };
}
