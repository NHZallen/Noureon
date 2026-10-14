// A picture of a file made smaller before it is sent to a model that sees: the models shrink anything over about 1568 pixels on its longest side themselves,
// so sending more only costs time and room in the request (the limit of a request is 25 MB). Only in the page, which has a canvas; a picture that is small
// enough, or that cannot be drawn, is sent as it is.

const MAX_SIDE = 1568;

/** { mimeType, bytes } of the picture, drawn smaller (JPEG) when its longest side is over 1568 pixels. */
export async function shrinkImage(image) {
  try {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return image;
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.mimeType }));
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_SIDE) {
      bitmap.close?.();
      return image;
    }
    const scale = MAX_SIDE / longest;
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    // A picture with a see-through background would turn black as a JPEG: it is drawn on white first.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
    return { ...image, mimeType: 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) };
  } catch {
    return image;
  }
}
