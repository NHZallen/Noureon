// The pixels of the picture a model answered with, for putting an edited frame back in a GIF (src/app/runtime/images/gif-frame-edit.js): drawn to fill a frame of `width` by `height` (what does not fit is cut off at
// the edges) on the canvas of @napi-rs/canvas, the same library the slides and the thumbnails use. A server image without it cannot read the answer: it says so and the page makes the GIF itself.

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

/** The RGBA pixels (Uint8ClampedArray) of `{ b64Json }` drawn to fill `width` by `height`. */
export async function pictureToFrame({ b64Json }, width, height, stretch = false) {
  const canvas = await loadCanvas();
  if (!canvas) throw new Error('This server cannot read the picture the model answered with.');
  const picture = await canvas.loadImage(Buffer.from(b64Json, 'base64'));
  const surface = canvas.createCanvas(width, height);
  const context = surface.getContext('2d');
  const scale = stretch ? 0 : Math.max(width / picture.width, height / picture.height);
  const drawn = stretch ? [width, height] : [picture.width * scale, picture.height * scale];
  context.drawImage(picture, (width - drawn[0]) / 2, (height - drawn[1]) / 2, drawn[0], drawn[1]);
  return new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
}

/** A picture of these RGBA pixels (a png) as `{ b64Json, mediaType }`. */
export async function rgbaToPng(rgba, width, height) {
  const canvas = await loadCanvas();
  if (!canvas) throw new Error('This server cannot draw the sheet of frames.');
  const surface = canvas.createCanvas(width, height);
  surface.getContext('2d').putImageData(new canvas.ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return { b64Json: surface.toBuffer('image/png').toString('base64'), mediaType: 'image/png' };
}
