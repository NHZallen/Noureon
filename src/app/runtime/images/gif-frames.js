// The frames of a GIF (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §9): each one drawn as the person sees it (the frames that only change a part of the picture are put on the ones before them,
// the transparent parts and the disposal methods are followed), with the time it stays. The editor of a picture shows them one by one, so a frame can be marked on its own. Plain arrays only (no window, no
// document, no canvas), so it can be tested and could run on the server. The browsers do not all have an ImageDecoder, so the file is read here.

const MAX_FRAMES = 64;
const MAX_PIXELS = 16_000_000;

// The LZW of a GIF: `minCodeSize` is the first byte of the data, `bytes` the data of all its blocks joined; the result is the indices of the colours, `size` of them.
function lzwDecode(minCodeSize, bytes, size) {
  const out = new Uint8Array(size);
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const prefix = new Uint16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  let codeSize = minCodeSize + 1;
  let available = clear + 2;
  let previous = -1;
  let first = 0;
  let buffer = 0;
  let bits = 0;
  let position = 0;
  let written = 0;
  for (let index = 0; index < clear; index += 1) suffix[index] = index;
  for (let offset = 0; offset < bytes.length && written < size;) {
    buffer |= bytes[offset] << bits;
    offset += 1;
    bits += 8;
    while (bits >= codeSize && written < size) {
      let code = buffer & ((1 << codeSize) - 1);
      buffer >>= codeSize;
      bits -= codeSize;
      if (code === clear) {
        codeSize = minCodeSize + 1;
        available = clear + 2;
        previous = -1;
        continue;
      }
      if (code === end) return out;
      if (previous === -1) {
        out[written] = suffix[code];
        written += 1;
        previous = code;
        first = code;
        continue;
      }
      // A code that is not in the table yet (and is not the very next one) is damage: what was read so far is what there is.
      if (code > available) return out;
      const incoming = code;
      let top = 0;
      if (code >= available) {
        stack[top] = first;
        top += 1;
        code = previous;
      }
      while (code >= clear && top < 4096) {
        stack[top] = suffix[code];
        top += 1;
        code = prefix[code];
      }
      first = suffix[code];
      stack[top] = first;
      top += 1;
      if (available < 4096) {
        prefix[available] = previous;
        suffix[available] = first;
        available += 1;
        if ((available & (available - 1)) === 0 && available < 4096) codeSize += 1;
      }
      previous = incoming;
      while (top > 0 && written < size) {
        top -= 1;
        out[written] = stack[top];
        written += 1;
      }
    }
    position = offset;
  }
  void position;
  return out;
}

const readColors = (bytes, offset, count) => bytes.subarray(offset, offset + count * 3);

/**
 * { width, height, frames: [{ rgba, delayMs }], loops } for the bytes of a GIF, or null when they are not one that can be read (not a GIF, cut short, more than 64 frames, too big).
 * `rgba` is a Uint8ClampedArray of width * height * 4 for the whole picture at that moment.
 */
export function decodeGif(input) {
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const tag = String.fromCharCode(...bytes.subarray(0, 6));
    if (tag !== 'GIF87a' && tag !== 'GIF89a') return null;
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    if (!width || !height || width * height > MAX_PIXELS) return null;
    const screenFlags = bytes[10];
    let offset = 13;
    let globalColors = null;
    if (screenFlags & 0x80) {
      const count = 2 << (screenFlags & 7);
      globalColors = readColors(bytes, offset, count);
      offset += count * 3;
    }
    const canvas = new Uint8ClampedArray(width * height * 4);
    const frames = [];
    let loops = true;
    let control = { delay: 100, disposal: 0, transparent: -1 };
    while (offset < bytes.length) {
      const block = bytes[offset];
      offset += 1;
      if (block === 0x3b) break;
      if (block === 0x21) {
        const label = bytes[offset];
        offset += 1;
        if (label === 0xf9) {
          const flags = bytes[offset + 1];
          control = { delay: (bytes[offset + 2] | (bytes[offset + 3] << 8)) * 10, disposal: (flags >> 2) & 7, transparent: flags & 1 ? bytes[offset + 4] : -1 };
        } else if (label === 0xff && String.fromCharCode(...bytes.subarray(offset + 1, offset + 12)).startsWith('NETSCAPE')) {
          loops = true;
        }
        while (offset < bytes.length && bytes[offset] !== 0) offset += bytes[offset] + 1;
        if (offset >= bytes.length) return null;
        offset += 1;
      } else if (block === 0x2c) {
        const left = bytes[offset] | (bytes[offset + 1] << 8);
        const top = bytes[offset + 2] | (bytes[offset + 3] << 8);
        const frameWidth = bytes[offset + 4] | (bytes[offset + 5] << 8);
        const frameHeight = bytes[offset + 6] | (bytes[offset + 7] << 8);
        const flags = bytes[offset + 8];
        offset += 9;
        // A frame lies inside the picture (a file that says otherwise is damaged: reading it would only take time).
        if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) return null;
        let colors = globalColors;
        if (flags & 0x80) {
          const count = 2 << (flags & 7);
          colors = readColors(bytes, offset, count);
          offset += count * 3;
        }
        const minCodeSize = bytes[offset];
        offset += 1;
        const chunks = [];
        let total = 0;
        while (offset < bytes.length && bytes[offset] !== 0) {
          const length = bytes[offset];
          chunks.push(bytes.subarray(offset + 1, offset + 1 + length));
          total += length;
          offset += length + 1;
        }
        if (offset >= bytes.length) return null;
        offset += 1;
        if (!colors || minCodeSize < 1 || minCodeSize > 8 || frames.length >= MAX_FRAMES) return null;
        const data = new Uint8Array(total);
        let at = 0;
        for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
        const indices = lzwDecode(minCodeSize, data, frameWidth * frameHeight);
        const before = control.disposal === 3 ? canvas.slice() : null;
        // Interlaced rows come in four passes.
        const rowOf = (row) => {
          if (!(flags & 0x40)) return row;
          const pass1 = Math.ceil(frameHeight / 8);
          const pass2 = Math.ceil((frameHeight - 4) / 8);
          const pass3 = Math.ceil((frameHeight - 2) / 4);
          if (row < pass1) return row * 8;
          if (row < pass1 + pass2) return (row - pass1) * 8 + 4;
          if (row < pass1 + pass2 + pass3) return (row - pass1 - pass2) * 4 + 2;
          return (row - pass1 - pass2 - pass3) * 2 + 1;
        };
        for (let row = 0; row < frameHeight; row += 1) {
          const y = top + rowOf(row);
          if (y >= height) continue;
          for (let column = 0; column < frameWidth; column += 1) {
            const x = left + column;
            const index = indices[row * frameWidth + column];
            if (x >= width || index === control.transparent) continue;
            const target = (y * width + x) * 4;
            canvas[target] = colors[index * 3];
            canvas[target + 1] = colors[index * 3 + 1];
            canvas[target + 2] = colors[index * 3 + 2];
            canvas[target + 3] = 255;
          }
        }
        frames.push({ rgba: canvas.slice(), delayMs: control.delay });
        if (control.disposal === 2) {
          for (let y = top; y < Math.min(height, top + frameHeight); y += 1) {
            for (let x = left; x < Math.min(width, left + frameWidth); x += 1) canvas.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 4);
          }
        } else if (before) {
          canvas.set(before);
        }
        control = { delay: 100, disposal: 0, transparent: -1 };
      } else {
        return null;
      }
    }
    return frames.length ? { width, height, frames, loops } : null;
  } catch {
    return null;
  }
}
