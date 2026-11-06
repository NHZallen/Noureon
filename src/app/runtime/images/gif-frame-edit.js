// Editing frames of a GIF (docs/superpowers/specs/2026-11-06-gpt-image-2-6-design.md §10, Allen's choice B). The person marked one frame (or a few) in the editor and said what to change: each marked frame goes to the
// picture model on its own, as a picture to edit, and what comes back, one still, takes the place of that frame in the GIF it came from; the other frames are not touched. The GIF is written again here (gif-encode.js), so
// this works with every picture model that edits pictures, whoever's it is. The page and the server share this file (no window, no document): the pixels of the answer of the model are read by `toFrame`, which the page
// (gif-frame-edit-page.js, a canvas) and the server (server/picture-frame.js, @napi-rs/canvas) each give.

import { decodeGif } from './gif-frames.js';
import { encodeGif } from './gif-encode.js';
import { IMAGE_ASPECT_RATIOS } from './image-generation-config.js';
import { dataUrlToBlob } from './picture-blob.js';
import { buildSheet, calibrateThreshold, changeMap, compositeChanges, flattenRgba, markMask, sheetLayout, sliceSheet } from './gif-sheet.js';

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

const pictureOf = (dataUrl) => {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(String(dataUrl));
  return match ? { mediaType: match[1], b64Json: match[2] } : null;
};

const toDataUrl = (bytes, mediaType) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { b64Json: btoa(binary), mediaType };
};

export const sheetInstruction = (layout, marked) => `The first picture is a contact sheet of the ${layout.count} frames of one animation, ${layout.columns} across and ${layout.rows} down, read from left to right and from top to bottom. `
  + `Apply the change that was asked to EVERY frame of the sheet, in the same way in all of them, so that the frames stay consistent with each other. Keep everything else exactly as it is: the grid, the size and place of every frame, the poses, the lighting and the style. `
  + `${marked.length ? `The other pictures show frame ${marked.map((index) => index + 1).join(', ')} with marks that point at what to change; use them to find it, and draw no marks. ` : ''}Answer with the whole sheet as one picture, in the same layout.`;

/**
 * The same edit for every frame (Allen's choice 2, §11): the frames are laid out in one sheet, the model changes the sheet once, the sheet is cut up, and only the places that changed are put back on the frames. `edits` are
 * the marked frames as in editGifFrames (the marks say where to look, and how large a change counts); `toFrame(picture, width, height, stretch)` reads the answer and `toPng(rgba, width, height)` gives `{ b64Json, mediaType }` of
 * the sheet (the page and the server each give them).
 */
export async function editGifSheet({ edits, gifDataUrl, prompt, modelInfo, apiKey, generateImage, signal, getText = (_key, fallback) => fallback, toFrame, toPng, encode = encodeGif }) {
  const blob = dataUrlToBlob(gifDataUrl);
  const gif = blob ? decodeGif(new Uint8Array(await blob.arrayBuffer())) : null;
  if (!gif || !edits.length || gif.frames.length !== edits[0].count) throw new Error(getText('imageGifSourceGone', 'The GIF these frames came from is no longer in this conversation, so the edited frames cannot be put back.'));
  const { width, height } = gif;
  const layout = sheetLayout(gif.frames.length, width, height);
  const sent = buildSheet(gif.frames.map((frame) => frame.rgba), layout, width, height);
  const sheet = await toPng(sent, layout.width, layout.height);
  const aspectRatio = closestAspectRatio(layout.width, layout.height, modelInfo.supportedImageAspectRatios);
  const marked = edits.map((edit) => edit.index);
  const answer = await generateImage({
    apiKey,
    model: modelInfo.apiId || modelInfo.id,
    provider: modelInfo.provider,
    prompt: `${prompt}\n\n${sheetInstruction(layout, marked)}`,
    config: { aspectRatio, n: 1 },
    inputReferences: [`data:${sheet.mediaType};base64,${sheet.b64Json}`, ...edits.map((edit) => edit.dataUrl)],
    signal
  });
  const picture = answer?.images?.[0];
  if (!picture?.b64Json) throw new Error(getText('imageNoResult', 'The image was made, but no picture came back to show.'));
  // What the model drew, and what it was given, cut into frames of the same size: only the difference between the two is a change.
  const back = sliceSheet(await toFrame(picture, layout.width, layout.height, true), layout, width, height);
  const before = sliceSheet(sent, layout, width, height);
  const maps = before.map((cell, index) => changeMap(cell, back[index], width, height));
  const marks = [];
  for (const edit of edits) {
    const annotated = pictureOf(edit.dataUrl);
    marks[edit.index] = annotated ? markMask(before[edit.index], flattenRgba(await toFrame(annotated, width, height)), width, height) : null;
  }
  const threshold = calibrateThreshold(maps, maps.map((_, index) => marks[index] || null));
  const frames = gif.frames.map((frame, index) => ({ ...frame, rgba: compositeChanges(frame.rgba, back[index], maps[index], width, height, { threshold }) }));
  const bytes = encode({ width, height, frames, loops: gif.loops });
  return { images: [{ ...toDataUrl(bytes, 'image/gif'), aspectRatio: closestAspectRatio(width, height) }] };
}

/**
 * `edits` are [{ index, count, dataUrl }]: each a marked frame as a picture. `gifDataUrl` is the GIF they came from. Returns { images: [{ b64Json, mediaType: 'image/gif', aspectRatio }] }.
 * `toFrame(picture, width, height)` gives the RGBA pixels of the answer of the model drawn to fill a frame (what does not fit is cut off at the edges); `encode` is for the tests.
 */
export async function editGifFrames({ edits, gifDataUrl, prompt, modelInfo, apiKey, generateImage, signal, getText = (_key, fallback) => fallback, toFrame, encode = encodeGif }) {
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
