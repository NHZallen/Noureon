// Editing frames of a GIF (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §10, Allen's choice B). The person marked one frame (or a few) in the editor and said what to change: each marked frame goes to the
// picture model on its own, as a picture to edit, and what comes back, one still, takes the place of that frame in the GIF it came from; the other frames are not touched. The GIF is written again here (gif-encode.js), so
// this works with every picture model that edits pictures, whoever's it is. It runs in the page (it draws the answer of the model on a canvas to get its pixels).

import { decodeGif } from './gif-frames.js';
import { encodeGif } from './gif-encode.js';
import { IMAGE_ASPECT_RATIOS } from './image-generation-config.js';
import { dataUrlToBlob } from './picture-blob.js';

/** The shape the model is asked for: the one of the GIF's frames, or the nearest that the model takes. */
export function closestAspectRatio(width, height, supported = []) {
  const wanted = Math.log(width / height);
  const choices = IMAGE_ASPECT_RATIOS.filter((ratio) => ratio !== 'auto' && (!supported.length || supported.includes(ratio)));
  let best = '1:1';
  let gap = Infinity;
  for (const ratio of choices) {
    const [w, h] = ratio.split(':').map(Number);
    const distance = Math.abs(Math.log(w / h) - wanted);
    if (distance < gap) { gap = distance; best = ratio; }
  }
  return best;
}

export const frameInstruction = (index, count) => `This picture is frame ${index + 1} of ${count} of an animation. Change only what was asked and keep everything else exactly as it is (the pose, the size and place of everything, the lighting and the style), so that the frame still fits between the frames before and after it. Answer with one still picture of the same shape.`;

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

/**
 * `edits` are [{ index, count, dataUrl }]: each a marked frame as a picture. `gifDataUrl` is the GIF they came from. Returns { images: [{ b64Json, mediaType: 'image/gif', aspectRatio }] }.
 * `toFrame` and `encode` are the pieces that need a canvas or are heavy, given by the tests.
 */
export async function editGifFrames({ edits, gifDataUrl, prompt, modelInfo, apiKey, generateImage, signal, getText = (_key, fallback) => fallback, toFrame = pictureToFrame, encode = encodeGif }) {
  const gone = () => new Error(getText('imageGifSourceGone', 'The GIF these frames came from is no longer in this conversation, so the edited frames cannot be put back.'));
  const blob = dataUrlToBlob(gifDataUrl);
  const gif = blob ? decodeGif(new Uint8Array(await blob.arrayBuffer())) : null;
  if (!gif || !edits.length || gif.frames.length !== edits[0].count) throw gone();
  const aspectRatio = closestAspectRatio(gif.width, gif.height, modelInfo.supportedImageAspectRatios);
  // One request for each marked frame, made together.
  const answers = await Promise.all(edits.map((edit) => generateImage({
    apiKey,
    model: modelInfo.apiId || modelInfo.id,
    provider: modelInfo.provider,
    prompt: `${prompt}\n\n${frameInstruction(edit.index, edit.count)}`,
    config: { aspectRatio, n: 1 },
    inputReferences: [edit.dataUrl],
    signal
  })));
  const frames = gif.frames.slice();
  for (const [at, answer] of answers.entries()) {
    const picture = answer?.images?.[0];
    if (!picture?.b64Json) throw new Error(getText('imageNoResult', 'The image was made, but no picture came back to show.'));
    frames[edits[at].index] = { ...frames[edits[at].index], rgba: await toFrame(picture, gif.width, gif.height) };
  }
  const bytes = encode({ width: gif.width, height: gif.height, frames, loops: gif.loops });
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { images: [{ b64Json: btoa(binary), mediaType: 'image/gif', aspectRatio }] };
}
