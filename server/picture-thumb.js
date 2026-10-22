// A small copy of a picture, for showing it to a text model (the picture it has just drawn, the ones it looks up): the longest side is cut to
// THUMB_SIDE and it is kept as a JPEG. The drawing library is not in every image of the server (it is the same one the slides use): without it a
// picture that is small enough goes as it is, and a larger one is left out (the model is told, not shown).

export const THUMB_SIDE = 512;
const THUMB_QUALITY = 70;
const AS_IS_BYTES = 150_000;

let canvasModule;
const loadCanvas = async () => {
  if (canvasModule === undefined) {
    try {
      canvasModule = await import('@napi-rs/canvas');
    } catch {
      canvasModule = null;
    }
  }
  return canvasModule;
};

/** { mimeType, data (base64) } for the bytes of a picture, or null when no small copy can be made. */
export async function makeThumbnail(bytes, mimeType = 'image/png', { side = THUMB_SIDE } = {}) {
  const canvas = await loadCanvas();
  if (canvas) {
    try {
      const picture = await canvas.loadImage(Buffer.from(bytes));
      const scale = Math.min(1, side / Math.max(picture.width, picture.height));
      const width = Math.max(1, Math.round(picture.width * scale));
      const height = Math.max(1, Math.round(picture.height * scale));
      const surface = canvas.createCanvas(width, height);
      const context = surface.getContext('2d');
      // A picture with clear places would turn black as a JPEG.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(picture, 0, 0, width, height);
      return { mimeType: 'image/jpeg', data: surface.toBuffer('image/jpeg', THUMB_QUALITY).toString('base64') };
    } catch {
      // A picture this library cannot read: below.
    }
  }
  return bytes.byteLength <= AS_IS_BYTES && /^image\/(png|jpeg|webp|gif)$/.test(mimeType) ? { mimeType, data: Buffer.from(bytes).toString('base64') } : null;
}
