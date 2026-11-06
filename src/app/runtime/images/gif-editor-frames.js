// The frames of a GIF made ready for the picture editor (generated-image-interactions.js): each one as a PNG address of its own, so it can be shown, marked and sent as a picture. The reading of the file is
// gif-frames.js; this part draws each frame on a canvas of the page. null when the picture is not a GIF with two frames or more that can be read (the editor then opens as for any picture).

import { dataUrlToBlob } from './picture-blob.js';

export async function loadGifFrames({ document, dataUrl }) {
  try {
    const blob = dataUrlToBlob(dataUrl);
    if (!blob || blob.type !== 'image/gif') return null;
    const { decodeGif } = await import('./gif-frames.js');
    const gif = decodeGif(new Uint8Array(await blob.arrayBuffer()));
    if (!gif || gif.frames.length < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = gif.width;
    canvas.height = gif.height;
    const context = canvas.getContext('2d');
    const frames = gif.frames.map((frame) => {
      context.putImageData(new ImageData(frame.rgba, gif.width, gif.height), 0, 0);
      return { dataUrl: canvas.toDataURL('image/png'), delayMs: frame.delayMs };
    });
    return { width: gif.width, height: gif.height, frames };
  } catch {
    return null;
  }
}
