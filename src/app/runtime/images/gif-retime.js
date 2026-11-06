// A GIF with the time of its frames changed (the speed chosen on a picture, docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §13): only the delay of each frame, in the Graphic Control Extension, is written again, so the
// picture of every frame stays byte for byte what it was and nothing is decoded. The blocks of the file are walked as the format says (a byte that looks like an extension inside the picture data is not touched).

/** `bytes` (a GIF) with each frame's time divided by `speed` (at least 20 ms, the unit of a GIF is 10 ms); the same bytes when the file cannot be read as a GIF. */
export function retimeGif(bytes, speed) {
  const data = new Uint8Array(bytes);
  if (!(speed > 0) || data.length < 14 || String.fromCharCode(...data.subarray(0, 3)) !== 'GIF') return data;
  const out = data.slice();
  const skipSubBlocks = (from) => {
    let at = from;
    while (at < out.length && out[at] !== 0) at += out[at] + 1;
    return at + 1;
  };
  let at = 13 + (out[10] & 0x80 ? 3 * 2 ** ((out[10] & 7) + 1) : 0);
  while (at < out.length) {
    const block = out[at];
    if (block === 0x3b) return out;
    if (block === 0x21) {
      if (out[at + 1] === 0xf9 && out[at + 2] === 4) {
        const centiseconds = out[at + 4] | (out[at + 5] << 8);
        const next = Math.min(65535, Math.max(2, Math.round(centiseconds / speed)));
        out[at + 4] = next & 255;
        out[at + 5] = next >> 8;
      }
      at = skipSubBlocks(at + 2);
    } else if (block === 0x2c) {
      const flags = out[at + 9];
      at += 10 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1;
      at = skipSubBlocks(at);
    } else {
      return data;
    }
  }
  return data;
}
