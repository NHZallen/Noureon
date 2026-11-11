// The size of a picture, read from the first bytes of its file (PNG, JPEG, GIF, WebP) without decoding it. The card of a picture has to be the picture's shape before the picture
// is drawn: the browser only decodes a picture when it comes near the screen, and a card that is the wrong shape until then moves everything below it when it is put right.

const be16 = (b, i) => (b[i] << 8) | b[i + 1];
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b, i) => b[i] | (b[i + 1] << 8);
const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const tag = (b, i, text) => [...text].every((char, k) => b[i + k] === char.charCodeAt(0));

/** { width, height } of the picture whose first bytes these are, or null when the format is not known or the header is not all here. */
export function pictureSizeOf(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (b.length >= 24 && b[0] === 0x89 && tag(b, 1, 'PNG') && tag(b, 12, 'IHDR')) return clean(be32(b, 16), be32(b, 20));
  if (b.length >= 10 && (tag(b, 0, 'GIF87a') || tag(b, 0, 'GIF89a'))) return clean(le16(b, 6), le16(b, 8));
  if (b.length >= 25 && tag(b, 0, 'RIFF') && tag(b, 8, 'WEBP')) {
    if (b.length >= 30 && tag(b, 12, 'VP8X')) return clean(le24(b, 24) + 1, le24(b, 27) + 1);
    if (tag(b, 12, 'VP8L') && b[20] === 0x2f) {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return clean((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (b.length >= 30 && tag(b, 12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return clean(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at + 9 < b.length) {
      if (b[at] !== 0xff) { at += 1; continue; }
      const marker = b[at + 1];
      if (marker === 0xff) { at += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
      const length = be16(b, at + 2);
      // The start-of-frame markers (not the tables that share the range) hold the size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return clean(be16(b, at + 7), be16(b, at + 5));
      at += 2 + length;
    }
  }
  return null;
}

function clean(width, height) {
  return width > 0 && height > 0 && width < 65536 && height < 65536 ? { width, height } : null;
}

/** The size from the beginning of a file (a Blob), or null. */
export async function pictureSizeOfBlob(blob) {
  try {
    if (!blob || typeof blob.slice !== 'function') return null;
    return pictureSizeOf(new Uint8Array(await blob.slice(0, 262144).arrayBuffer()));
  } catch {
    return null;
  }
}

/** The size from the beginning of a picture kept as base64 text (what a message holds), or null. Only the first part of the text is decoded. */
export function pictureSizeOfBase64(data) {
  try {
    if (typeof data !== 'string' || !data) return null;
    const text = data.slice(0, 174764); // 128 KB of file, a whole number of 4-character groups
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return pictureSizeOf(bytes);
  } catch {
    return null;
  }
}
