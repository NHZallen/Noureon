// The part of editing a frame of a GIF that needs the canvas of the page (gif-frame-edit.js is shared with the server and has none).

/** The pixels of a picture of the model, drawn to fill a frame of `width` by `height` (what does not fit is cut off at the edges). Uses the canvas of the page. */
export async function pictureToFrame({ b64Json, mediaType = 'image/png' }, width, height) {
  const image = await new Promise((resolve, reject) => {
    const element = globalThis.document.createElement('img');
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('The edited frame could not be read.'));
    element.src = `data:${mediaType};base64,${b64Json}`;
  });
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawn = [image.naturalWidth * scale, image.naturalHeight * scale];
  context.drawImage(image, (width - drawn[0]) / 2, (height - drawn[1]) / 2, drawn[0], drawn[1]);
  return context.getImageData(0, 0, width, height).data;
}
