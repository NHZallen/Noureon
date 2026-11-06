// A GIF written from frames (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §10): the other half of gif-frames.js. A frame that is edited in the editor of a picture comes back from the picture model as a
// still; it is put in its place among the frames of the GIF it came from and the GIF is written again. Plain arrays only (no window, no document, no canvas).
// A GIF has at most 256 colours in a frame: a frame that has no more than that (the frames of a GIF read by gif-frames.js nearly always) is written exactly; a frame that has more (a picture of the model) is
// reduced by the median cut and dithered (Floyd-Steinberg) so that a soft shade does not turn into bands.

const key15 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

/** { indices, palette: [r,g,b, r,g,b…], transparent } for the RGBA pixels of a frame: `transparent` is the index of the colour that stands for the pixels with no colour, or -1. */
export function quantizeFrame(rgba, width, height) {
  const count = width * height;
  const hasHole = (index) => rgba[index * 4 + 3] < 128;
  let holes = false;
  const distinct = new Map();
  for (let index = 0; index < count; index += 1) {
    if (hasHole(index)) { holes = true; continue; }
    if (distinct.size <= 256) distinct.set((rgba[index * 4] << 16) | (rgba[index * 4 + 1] << 8) | rgba[index * 4 + 2], 0);
  }
  const room = holes ? 255 : 256;
  const indices = new Uint8Array(count);
  const palette = [];
  if (distinct.size <= room) {
    const at = new Map();
    for (const color of distinct.keys()) { at.set(color, palette.length / 3); palette.push(color >> 16, (color >> 8) & 255, color & 255); }
    for (let index = 0; index < count; index += 1) {
      indices[index] = hasHole(index) ? palette.length / 3 : at.get((rgba[index * 4] << 16) | (rgba[index * 4 + 1] << 8) | rgba[index * 4 + 2]);
    }
    const transparent = holes ? palette.length / 3 : -1;
    if (holes) palette.push(0, 0, 0);
    return { indices, palette, transparent };
  }
  // Median cut on the 15-bit histogram.
  const histogram = new Uint32Array(32768);
  for (let index = 0; index < count; index += 1) if (!hasHole(index)) histogram[key15(rgba[index * 4], rgba[index * 4 + 1], rgba[index * 4 + 2])] += 1;
  let boxes = [{ keys: [] }];
  for (let k = 0; k < 32768; k += 1) if (histogram[k]) boxes[0].keys.push(k);
  const channel = (k, axis) => (axis === 0 ? k >> 10 : axis === 1 ? (k >> 5) & 31 : k & 31);
  const spread = (box) => {
    const low = [31, 31, 31];
    const high = [0, 0, 0];
    for (const k of box.keys) for (let axis = 0; axis < 3; axis += 1) { const v = channel(k, axis); if (v < low[axis]) low[axis] = v; if (v > high[axis]) high[axis] = v; }
    const sizes = [high[0] - low[0], high[1] - low[1], high[2] - low[2]];
    const axis = sizes[0] >= sizes[1] && sizes[0] >= sizes[2] ? 0 : sizes[1] >= sizes[2] ? 1 : 2;
    return { axis, size: sizes[axis] };
  };
  while (boxes.length < room) {
    let pick = -1;
    let best = 0;
    boxes.forEach((box, at) => { if (box.keys.length > 1) { const score = spread(box).size * Math.log2(box.keys.length + 1); if (score > best) { best = score; pick = at; } } });
    if (pick < 0) break;
    const box = boxes[pick];
    const { axis } = spread(box);
    box.keys.sort((a, b) => channel(a, axis) - channel(b, axis));
    const total = box.keys.reduce((sum, k) => sum + histogram[k], 0);
    let running = 0;
    let cut = 1;
    for (let at = 0; at < box.keys.length - 1; at += 1) { running += histogram[box.keys[at]]; cut = at + 1; if (running * 2 >= total) break; }
    boxes.splice(pick, 1, { keys: box.keys.slice(0, cut) }, { keys: box.keys.slice(cut) });
  }
  boxes = boxes.filter((box) => box.keys.length);
  for (const box of boxes) {
    let r = 0; let g = 0; let b = 0; let weight = 0;
    for (const k of box.keys) { const w = histogram[k]; r += (k >> 10) * w; g += ((k >> 5) & 31) * w; b += (k & 31) * w; weight += w; }
    palette.push(Math.round(((r / weight) * 255) / 31), Math.round(((g / weight) * 255) / 31), Math.round(((b / weight) * 255) / 31));
  }
  const size = palette.length / 3;
  const nearest = new Int16Array(32768).fill(-1);
  const look = (r, g, b) => {
    const k = key15(r, g, b);
    if (nearest[k] >= 0 && Math.abs(r - ((k >> 10) << 3)) < 8) return nearest[k];
    let best = 0; let bestDistance = Infinity;
    for (let at = 0; at < size; at += 1) { const dr = r - palette[at * 3]; const dg = g - palette[at * 3 + 1]; const db = b - palette[at * 3 + 2]; const d = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (d < bestDistance) { bestDistance = d; best = at; } }
    return best;
  };
  // Floyd-Steinberg: the error of a pixel goes to the ones beside and below it.
  let current = new Float32Array((width + 2) * 3);
  let next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y += 1) {
    next.fill(0);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (hasHole(index)) { indices[index] = size; continue; }
      const want = [0, 1, 2].map((c) => Math.min(255, Math.max(0, rgba[index * 4 + c] + current[(x + 1) * 3 + c])));
      const at = look(Math.round(want[0]), Math.round(want[1]), Math.round(want[2]));
      indices[index] = at;
      for (let c = 0; c < 3; c += 1) {
        const error = want[c] - palette[at * 3 + c];
        current[(x + 2) * 3 + c] += error * 7 / 16;
        next[x * 3 + c] += error * 3 / 16;
        next[(x + 1) * 3 + c] += error * 5 / 16;
        next[(x + 2) * 3 + c] += error * 1 / 16;
      }
    }
    [current, next] = [next, current];
  }
  const transparent = holes ? size : -1;
  if (holes) palette.push(0, 0, 0);
  return { indices, palette, transparent };
}

// The LZW of a GIF: the indices of the colours become codes of 3 to 12 bits.
function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out = [];
  let buffer = 0;
  let bits = 0;
  let codeSize = minCodeSize + 1;
  const put = (code) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) { out.push(buffer & 255); buffer >>>= 8; bits -= 8; }
  };
  let table = new Map();
  let next = end + 1;
  put(clear);
  let prefix = indices[0];
  for (let at = 1; at < indices.length; at += 1) {
    const symbol = indices[at];
    const found = table.get(prefix * 256 + symbol);
    if (found !== undefined) { prefix = found; continue; }
    put(prefix);
    if (next < 4096) {
      table.set(prefix * 256 + symbol, next);
      if (next === (1 << codeSize) && codeSize < 12) codeSize += 1;
      next += 1;
    } else {
      put(clear);
      table = new Map();
      next = end + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = symbol;
  }
  put(prefix);
  put(end);
  if (bits > 0) out.push(buffer & 255);
  return out;
}

/** The bytes of a GIF for frames ({ rgba, delayMs }) of one size. Every frame is written whole (a frame is not drawn over the one before it), so a hole in a frame shows the page and not the frame before. */
export function encodeGif({ width, height, frames, loops = true }) {
  const bytes = [];
  const word = (value) => bytes.push(value & 255, (value >> 8) & 255);
  bytes.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  word(width); word(height);
  bytes.push(0, 0, 0);
  if (loops) bytes.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  for (const frame of frames) {
    const { indices, palette, transparent } = quantizeFrame(frame.rgba, width, height);
    const colors = palette.length / 3;
    let power = 1;
    while ((1 << power) < colors) power += 1;
    const minCodeSize = Math.max(2, power);
    const delay = Math.min(65535, Math.max(2, Math.round((Number(frame.delayMs) || 100) / 10)));
    bytes.push(0x21, 0xf9, 4, (2 << 2) | (transparent >= 0 ? 1 : 0)); // disposal 2: the frame is taken away before the next
    word(delay);
    bytes.push(transparent >= 0 ? transparent : 0, 0);
    bytes.push(0x2c); word(0); word(0); word(width); word(height);
    bytes.push(0x80 | (power - 1));
    for (let at = 0; at < (1 << power) * 3; at += 1) bytes.push(palette[at] ?? 0);
    bytes.push(minCodeSize);
    const data = lzwEncode(indices, minCodeSize);
    for (let at = 0; at < data.length; at += 255) { const part = data.slice(at, at + 255); bytes.push(part.length, ...part); }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
